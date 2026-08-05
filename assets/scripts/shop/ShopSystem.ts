import { _decorator, Component, Node, director } from 'cc';
import { ShopItemType, ExpandSide, StallType, HeroType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { EventBus, GameEvent, CoinChangedPayload, ShopPurchasePayload } from '../core/GameEvent';
import { ShopCatalog, ShopItemConfig } from './ShopConfig';
import { HeroSelectUI } from '../ui/HeroSelectUI';

const { ccclass, property } = _decorator;

/**
 * 商店系统：校验前置条件；扣款由经济系统执行。
 * 支持购买区累进投币：先付部分 → 付清后再 finalize 发创建指令。
 */
@ccclass('ShopSystem')
export class ShopSystem extends Component {
    private _coin: number = GameConstants.PLAYER_INIT_COIN;
    private _towerBuilt: boolean = false;
    private _helperBought: boolean = false;
    private _heroCount: number = 0;
    private _cookedStallBought: boolean = false;
    private _expandEast: boolean = false;
    private _expandWest: boolean = false;
    private _boughtFlags: Set<string> = new Set();
    /** 英雄购买点已预付清，选英雄时不再扣款 */
    private _heroPrepaid: Set<string> = new Set();
    private _pendingSpend: {
        amount: number;
        reason: string;
        onResult: (ok: boolean) => void;
    } | null = null;

    protected onLoad(): void {
        EventBus.on(GameEvent.COIN_CHANGED, this._onCoin, this);
        EventBus.on(GameEvent.TOWER_BUILT, this._onTowerBuilt, this);
        EventBus.on(GameEvent.HERO_CREATED, this._onHeroCreated, this);
        EventBus.on(GameEvent.HERO_SELECTED, this._onHeroSelected, this);
        EventBus.on(GameEvent.SPEND_COIN_RESULT, this._onSpendResult, this);
        // 与 SceneTileSystem / 测试强制解锁同步，保证伐木工等前置条件成立
        EventBus.on(GameEvent.EXPAND_UNLOCKED, this._onExpandUnlocked, this);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.COIN_CHANGED, this._onCoin, this);
        EventBus.off(GameEvent.TOWER_BUILT, this._onTowerBuilt, this);
        EventBus.off(GameEvent.HERO_CREATED, this._onHeroCreated, this);
        EventBus.off(GameEvent.HERO_SELECTED, this._onHeroSelected, this);
        EventBus.off(GameEvent.SPEND_COIN_RESULT, this._onSpendResult, this);
        EventBus.off(GameEvent.EXPAND_UNLOCKED, this._onExpandUnlocked, this);
    }

    public get coin(): number {
        return this._coin;
    }

    public get heroCount(): number {
        return this._heroCount;
    }

    public getPrice(
        itemType: ShopItemType,
        extra?: { side?: ExpandSide; towerId?: string },
    ): number {
        const cfg = this._findConfig(itemType, extra?.side);
        return cfg?.price ?? GameConstants.SHOP_PRICE[itemType] ?? 0;
    }

    /** 是否允许向该商品投币（前置条件 + 未买过） */
    public canContribute(
        itemType: ShopItemType,
        extra?: { side?: ExpandSide; towerId?: string; stallId?: string },
    ): boolean {
        const cfg = this._findConfig(itemType, extra?.side);
        if (!cfg) {
            return false;
        }
        const key = this._buyKey(itemType, extra);
        if (this._boughtFlags.has(key)) {
            return false;
        }
        return this._checkPrereq(cfg, extra);
    }

    /**
     * 累进投币：扣除 min(身上金币, want)，不足全价也可。
     * 成功后通过 onResult(true, paid) 回调；失败 onResult(false, 0)。
     */
    public contributeCoins(
        want: number,
        reason: string,
        onResult: (ok: boolean, paid: number) => void,
    ): boolean {
        if (want <= 0 || this._coin <= 0 || this._pendingSpend) {
            onResult(false, 0);
            return false;
        }
        const amount = Math.min(want, this._coin);
        this._pendingSpend = {
            amount,
            reason,
            onResult: (ok) => onResult(ok, ok ? amount : 0),
        };
        EventBus.emit(GameEvent.REQUEST_SPEND_COIN, { amount, reason });
        return true;
    }

    /**
     * 付清后结算：发创建指令。英雄则打开二选一（已预付，选完不再扣款）。
     */
    public finalizePurchase(
        itemType: ShopItemType,
        extra?: {
            side?: ExpandSide;
            towerId?: string;
            stallId?: string;
            extraTowerIds?: string[];
        },
    ): boolean {
        const cfg = this._findConfig(itemType, extra?.side);
        if (!cfg) {
            return false;
        }
        const key = this._buyKey(itemType, extra);
        if (this._boughtFlags.has(key)) {
            return false;
        }
        if (!this._checkPrereq(cfg, extra)) {
            return false;
        }

        if (itemType === ShopItemType.Hero) {
            const towerId = extra?.towerId ?? 'tower_0';
            this._heroPrepaid.add(towerId);
            this._openHeroSelect(towerId, 0);
            return true;
        }

        this._boughtFlags.add(key);
        this._dispatchCommand(itemType, extra);
        EventBus.emit(GameEvent.SHOP_PURCHASE_SUCCESS, {
            itemType,
            side: extra?.side,
            towerId: extra?.towerId,
            extraTowerIds: extra?.extraTowerIds,
            stallId: extra?.stallId,
        } as ShopPurchasePayload);
        return true;
    }

    /** @deprecated 保留兼容；新逻辑请用 contribute + finalize */
    public tryPurchase(
        itemType: ShopItemType,
        extra?: { side?: ExpandSide; towerId?: string; stallId?: string },
    ): boolean {
        if (!this.canContribute(itemType, extra)) {
            return false;
        }
        const price = this.getPrice(itemType, extra);
        if (this._coin < price) {
            return false;
        }
        if (itemType === ShopItemType.Hero) {
            this._openHeroSelect(extra?.towerId ?? 'tower_0', price);
            return true;
        }
        const key = this._buyKey(itemType, extra);
        this.contributeCoins(price, key, (ok) => {
            if (ok) {
                this.finalizePurchase(itemType, extra);
            }
        });
        return true;
    }

    private _onSpendResult(data: { success: boolean; reason?: string }): void {
        if (this._pendingSpend && data.reason === this._pendingSpend.reason) {
            const pending = this._pendingSpend;
            this._pendingSpend = null;
            pending.onResult(data.success);
            return;
        }
        // 兼容旧英雄扣款路径
        if (data.reason?.startsWith('hero_') && data.success) {
            const towerId = data.reason.slice('hero_'.length);
            this._boughtFlags.add(this._buyKey(ShopItemType.Hero, { towerId }));
        }
    }

    private _onHeroSelected(data: { heroType: HeroType; towerId: string; price: number }): void {
        const key = this._buyKey(ShopItemType.Hero, { towerId: data.towerId });
        if (this._boughtFlags.has(key)) {
            return;
        }
        const prepaid = this._heroPrepaid.has(data.towerId) || data.price <= 0;
        if (prepaid) {
            this._heroPrepaid.delete(data.towerId);
            this._boughtFlags.add(key);
            EventBus.emit(GameEvent.CMD_CREATE_HERO, {
                towerId: data.towerId,
                heroType: data.heroType,
            });
            EventBus.emit(GameEvent.SHOP_PURCHASE_SUCCESS, {
                itemType: ShopItemType.Hero,
                towerId: data.towerId,
            } as ShopPurchasePayload);
            return;
        }
        if (this._coin < data.price) {
            return;
        }
        this.contributeCoins(data.price, `hero_${data.towerId}`, (ok) => {
            if (!ok) {
                return;
            }
            this._boughtFlags.add(key);
            EventBus.emit(GameEvent.CMD_CREATE_HERO, {
                towerId: data.towerId,
                heroType: data.heroType,
            });
            EventBus.emit(GameEvent.SHOP_PURCHASE_SUCCESS, {
                itemType: ShopItemType.Hero,
                towerId: data.towerId,
            } as ShopPurchasePayload);
        });
    }

    private _dispatchCommand(
        itemType: ShopItemType,
        extra?: {
            side?: ExpandSide;
            towerId?: string;
            stallId?: string;
            extraTowerIds?: string[];
        },
    ): void {
        switch (itemType) {
            case ShopItemType.ArrowTower: {
                const ids = this._collectTowerIds(extra?.towerId ?? 'tower_south', extra?.extraTowerIds);
                for (const id of ids) {
                    EventBus.emit(GameEvent.CMD_BUILD_TOWER, {
                        towerId: id,
                        isExpand: false,
                    });
                }
                this._towerBuilt = true;
                break;
            }
            case ShopItemType.MeatHelper:
                EventBus.emit(GameEvent.CMD_CREATE_HELPER, { stallId: extra?.stallId ?? 'stall_raw' });
                this._helperBought = true;
                break;
            case ShopItemType.CookedMeatStall:
                EventBus.emit(GameEvent.CMD_CREATE_STALL, {
                    stallType: StallType.CookedMeat,
                    stallId: extra?.stallId ?? 'stall_cooked',
                });
                EventBus.emit(GameEvent.CMD_CREATE_HELPER, { stallId: extra?.stallId ?? 'stall_cooked' });
                this._cookedStallBought = true;
                break;
            case ShopItemType.ExpandArea:
                EventBus.emit(GameEvent.CMD_UNLOCK_EXPAND, { side: extra?.side ?? ExpandSide.East });
                if (extra?.side === ExpandSide.West) {
                    this._expandWest = true;
                } else {
                    this._expandEast = true;
                }
                break;
            case ShopItemType.Lumberjack:
                EventBus.emit(GameEvent.CMD_CREATE_LUMBERJACK, { side: extra?.side });
                break;
            case ShopItemType.ExpandTower: {
                const ids = this._collectTowerIds(extra?.towerId ?? 'tower_expand', extra?.extraTowerIds);
                for (const id of ids) {
                    EventBus.emit(GameEvent.CMD_BUILD_TOWER, {
                        towerId: id,
                        isExpand: true,
                    });
                }
                break;
            }
            default:
                break;
        }
    }

    private _collectTowerIds(primary: string, extras?: string[]): string[] {
        const out: string[] = [];
        const push = (id: string) => {
            const t = (id || '').trim();
            if (t && !out.includes(t)) {
                out.push(t);
            }
        };
        push(primary);
        for (const id of extras || []) {
            push(id);
        }
        return out;
    }

    private _openHeroSelect(towerId: string, price: number): void {
        const payload = { towerId, price };
        const ui = this._findHeroSelectUI();
        if (ui) {
            // 节点默认关闭时 onLoad 未跑，直接 show 会先激活再打开
            ui.show(payload);
        }
        // 仍发事件，便于引导等监听；已打开时 HeroSelectUI 会再收到一次（show 幂等）
        EventBus.emit(GameEvent.OPEN_HERO_SELECT, payload);
    }

    /** 含 inactive 节点（HeroSelect 开局关闭） */
    private _findHeroSelectUI(): HeroSelectUI | null {
        const scene = this.node.scene ?? director.getScene();
        if (!scene) {
            return null;
        }
        return this._findCompInTree(scene, HeroSelectUI);
    }

    private _findCompInTree<T extends Component>(
        node: Node,
        type: new (...args: any[]) => T,
    ): T | null {
        const self = node.getComponent(type);
        if (self) {
            return self;
        }
        for (const child of node.children) {
            const found = this._findCompInTree(child, type);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private _checkPrereq(cfg: ShopItemConfig, extra?: { side?: ExpandSide }): boolean {
        if (cfg.requireTowerBuilt && !this._towerBuilt) {
            return false;
        }
        if (cfg.requireHelper && !this._helperBought) {
            return false;
        }
        if (cfg.requireAnyHero && this._heroCount < 1) {
            return false;
        }
        if (cfg.requireBothHeroes && this._heroCount < 2) {
            return false;
        }
        if (cfg.requireCookedStall && !this._cookedStallBought) {
            return false;
        }
        if (cfg.itemType === ShopItemType.ExpandArea) {
            if (extra?.side === ExpandSide.East && this._expandEast) {
                return false;
            }
            if (extra?.side === ExpandSide.West && this._expandWest) {
                return false;
            }
        }
        if (cfg.itemType === ShopItemType.Lumberjack) {
            const side = extra?.side;
            if (side === ExpandSide.East && !this._expandEast) {
                return false;
            }
            if (side === ExpandSide.West && !this._expandWest) {
                return false;
            }
        }
        return true;
    }

    private _findConfig(itemType: ShopItemType, side?: ExpandSide): ShopItemConfig | undefined {
        return ShopCatalog.find((c) => c.itemType === itemType && (c.side === undefined || c.side === side));
    }

    private _buyKey(itemType: ShopItemType, extra?: { side?: ExpandSide; towerId?: string }): string {
        return `${itemType}_${extra?.side ?? ''}_${extra?.towerId ?? ''}`;
    }

    private _onCoin(data: CoinChangedPayload): void {
        this._coin = data.coin;
    }

    private _onTowerBuilt(data: { towerId: string; isExpand?: boolean }): void {
        if (!data.isExpand) {
            this._towerBuilt = true;
        }
    }

    private _onExpandUnlocked(data: { side: ExpandSide }): void {
        if (data.side === ExpandSide.West) {
            this._expandWest = true;
        } else {
            this._expandEast = true;
        }
        // 测试强制解锁时也视为已买过烤肉摊，避免其它 UI 仍被卡
        this._cookedStallBought = true;
    }

    private _onHeroCreated(): void {
        this._heroCount++;
    }
}
