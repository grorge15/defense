import {
    _decorator,
    Component,
    Node,
    Label,
    Prefab,
    instantiate,
    Collider2D,
    BoxCollider2D,
    Contact2DType,
    Enum,
    Vec3,
    Size,
    RigidBody2D,
    ERigidBody2DType,
    CCString,
} from 'cc';
import { ShopItemType, ExpandSide, ResourceType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { EventBus, GameEvent, PlayerStatePayload, ShopPurchasePayload } from '../core/GameEvent';
import { flyResourceTo } from '../core/FlyTween';
import { ShopSystem } from './ShopSystem';
import { PlayerController } from '../player/PlayerController';
import { PlayerCarryStack } from '../player/PlayerCarryStack';
import { ResourceEconomySystem } from '../economy/ResourceEconomySystem';

const { ccclass, property } = _decorator;

/**
 * 触发区域购买（累进投币）：
 * - 金币不足也可投入：身上有多少扣多少，价格 Label 递减（如 60→30）
 * - 背部金币抛物线飞向购买 UI
 * - 剩余为 0 时 ShopSystem.finalizePurchase 真正解锁
 */
@ccclass('PurchaseTrigger')
export class PurchaseTrigger extends Component {
    @property({ type: Enum(ShopItemType), tooltip: '商品类型' })
    public itemType: ShopItemType = ShopItemType.ArrowTower;

    @property({ type: Enum(ExpandSide), tooltip: '扩展方向（仅拓展相关商品）' })
    public expandSide: ExpandSide = ExpandSide.East;

    @property({ tooltip: '关联箭塔 ID（须与 ArrowTower.towerId 一致）' })
    public towerId: string = '';

    @property({
        type: [CCString],
        tooltip: '额外同时解锁的箭塔 ID（一次付清可建多座；须场景里已有对应 ArrowTower）',
    })
    public extraTowerIds: string[] = [];

    @property({ tooltip: '关联摊位 ID' })
    public stallId: string = '';

    @property({
        type: Node,
        tooltip: '购买 UI 根节点（靠近判定与飞币落点以此为准）',
    })
    public uiRoot: Node | null = null;

    @property({ type: Label, tooltip: '剩余价格 Label' })
    public priceLabel: Label | null = null;

    @property({ type: ShopSystem, tooltip: '场景中的 ShopSystem' })
    public shop: ShopSystem | null = null;

    @property({ type: Prefab, tooltip: '飞币表现：可拖 pref_coin；空则从背负/经济系统取' })
    public coinFlyPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: '飞币起点：空则用玩家 CarryRoot / 玩家节点' })
    public coinFlyFrom: Node | null = null;

    @property({ tooltip: '玩家进入后自动投币' })
    public autoPurchase: boolean = true;

    @property({ tooltip: '靠近判定半径（相对 uiRoot 世界坐标）' })
    public interactRadius: number = 90;

    @property({ tooltip: '投币尝试间隔（秒）' })
    public buyInterval: number = 0.2;

    @property({ tooltip: '单次飞币视觉数量上限' })
    public maxFlyVisuals: number = 10;

    private _playerIn: boolean = false;
    private _purchased: boolean = false;
    private _pendingPay: boolean = false;
    private _playerPos: Vec3 = new Vec3();
    private _cooldown: number = 0;
    private _unlocked: boolean = true;
    private _remaining: number = 0;
    private _fullPrice: number = 0;

    public get purchased(): boolean {
        return this._purchased;
    }

    public get remainingPrice(): number {
        return this._remaining;
    }

    protected onLoad(): void {
        this._ensureCollider();
        this._bindSceneUI();
        if (!this.shop) {
            this.shop = this.node.scene?.getComponentInChildren(ShopSystem) ?? null;
        }
        this._fullPrice =
            this.shop?.getPrice(this.itemType, {
                side: this.expandSide,
                towerId: this.towerId || undefined,
            }) ?? GameConstants.SHOP_PRICE[this.itemType];
        this._remaining = this._fullPrice;
        this._refreshPriceLabel();
        const col = this.getComponent(Collider2D);
        if (col) {
            col.on(Contact2DType.BEGIN_CONTACT, this._onEnter, this);
            col.on(Contact2DType.END_CONTACT, this._onExit, this);
        }
        EventBus.on(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
        EventBus.on(GameEvent.SHOP_PURCHASE_SUCCESS, this._onPurchaseSuccess, this);
    }

    protected onDestroy(): void {
        const col = this.getComponent(Collider2D);
        if (col) {
            col.off(Contact2DType.BEGIN_CONTACT, this._onEnter, this);
            col.off(Contact2DType.END_CONTACT, this._onExit, this);
        }
        EventBus.off(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
        EventBus.off(GameEvent.SHOP_PURCHASE_SUCCESS, this._onPurchaseSuccess, this);
    }

    protected update(dt: number): void {
        if (!this._unlocked || this._purchased || !this.node.activeInHierarchy) {
            return;
        }
        this._refreshPlayerInZone();
        this._cooldown -= dt;
        if (!this._playerIn || !this.autoPurchase || this._cooldown > 0 || this._pendingPay) {
            return;
        }
        this.tryContribute();
        this._cooldown = this.buyInterval;
    }

    public setUnlocked(unlocked: boolean): void {
        this._unlocked = unlocked;
        this.node.active = unlocked;
    }

    /**
     * 向购买区投入：身上有多少扣多少（可不足全价）。
     * 背部金币抛物线飞向 UI，价格 Label 随飞币逐个递减（例 60→59→…→30）。
     */
    public tryContribute(): boolean {
        if (this._purchased || !this._unlocked || this._pendingPay || this._remaining <= 0) {
            return false;
        }
        if (!this.shop) {
            this.shop = this.node.scene?.getComponentInChildren(ShopSystem) ?? null;
        }
        if (!this.shop) {
            return false;
        }
        const extra = {
            side: this.expandSide,
            towerId: this.towerId || undefined,
            stallId: this.stallId || undefined,
            extraTowerIds: this._extraTowerIds(),
        };
        if (!this.shop.canContribute(this.itemType, extra)) {
            return false;
        }
        if (this.shop.coin <= 0) {
            return false;
        }
        const want = Math.min(this._remaining, this.shop.coin);
        const reason = `contrib_${this.itemType}_${this.expandSide}_${this.towerId || ''}`;
        this._pendingPay = true;
        return this.shop.contributeCoins(want, reason, (ok, paid) => {
            if (!ok || paid <= 0) {
                this._pendingPay = false;
                return;
            }
            // 钱包已扣；再按飞出数量从背部拆掉（若已由 Economy 同步则为 0，remove 无副作用）
            const carry = this.node.scene?.getComponentInChildren(PlayerCarryStack);
            const from = this._resolveFlyFrom();
            const to = this._zoneWorldPos().clone();
            this._playPayVisual(paid, from, to, carry, () => {
                this._pendingPay = false;
                if (this._remaining <= 0 && !this._purchased) {
                    this.shop?.finalizePurchase(this.itemType, extra);
                }
            });
        });
    }

    /** @deprecated 改用 tryContribute */
    public tryBuy(): boolean {
        return this.tryContribute();
    }

    private _onPurchaseSuccess(data: ShopPurchasePayload): void {
        if (!this._matchesPayload(data)) {
            return;
        }
        this._purchased = true;
        this._pendingPay = false;
        this._remaining = 0;
        this._refreshPriceLabel();
        if (this.uiRoot) {
            this.uiRoot.active = false;
        } else {
            this.node.active = false;
        }
    }

    private _refreshPriceLabel(): void {
        if (this.priceLabel) {
            this.priceLabel.string = `${this._remaining}`;
        }
    }

    private _resolveFlyFrom(): Vec3 {
        if (this.coinFlyFrom?.isValid) {
            return this.coinFlyFrom.worldPosition.clone();
        }
        const carry = this.node.scene?.getComponentInChildren(PlayerCarryStack);
        if (carry?.carryRoot?.isValid) {
            return carry.carryRoot.worldPosition.clone();
        }
        const player = this.node.scene?.getComponentInChildren(PlayerController);
        if (player) {
            return player.node.worldPosition.clone();
        }
        return this._playerPos.clone();
    }

    private _resolveCoinPrefab(): Prefab | null {
        if (this.coinFlyPrefab) {
            return this.coinFlyPrefab;
        }
        const carry = this.node.scene?.getComponentInChildren(PlayerCarryStack);
        if (carry?.coinPrefab) {
            return carry.coinPrefab;
        }
        const eco = this.node.scene?.getComponentInChildren(ResourceEconomySystem);
        return eco?.coinPrefab ?? null;
    }

    /**
     * 飞币 + 价格逐个递减。amount 为实际扣款；视觉飞币数封顶 maxFlyVisuals，
     * 每次起飞从背部 remove 对应份数，落地时均摊减少 remaining。
     */
    private _playPayVisual(
        amount: number,
        from: Vec3,
        to: Vec3,
        carry: PlayerCarryStack | null | undefined,
        onDone: () => void,
    ): void {
        const prefab = this._resolveCoinPrefab();
        const visualCount = Math.min(Math.max(1, amount), this.maxFlyVisuals);
        const perHit = Math.max(1, Math.floor(amount / visualCount));
        let leftToApply = amount;
        let finished = 0;

        const onOneArrive = (): void => {
            finished++;
            const isLast = finished >= visualCount;
            const pay = isLast ? leftToApply : Math.min(perHit, leftToApply);
            leftToApply = Math.max(0, leftToApply - pay);
            this._remaining = Math.max(0, this._remaining - pay);
            this._refreshPriceLabel();
            if (isLast) {
                onDone();
            }
        };

        const takeFromCarry = (pay: number): void => {
            carry?.remove(ResourceType.Coin, pay);
        };

        if (!prefab) {
            for (let i = 0; i < visualCount; i++) {
                this.scheduleOnce(() => {
                    const isLast = i >= visualCount - 1;
                    const pay = isLast ? leftToApply : Math.min(perHit, leftToApply);
                    takeFromCarry(pay);
                    onOneArrive();
                }, i * 0.05);
            }
            return;
        }

        const parent = this.uiRoot?.parent ?? this.node;
        for (let i = 0; i < visualCount; i++) {
            const isLast = i >= visualCount - 1;
            const payPreview = isLast
                ? amount - perHit * (visualCount - 1)
                : perHit;
            takeFromCarry(Math.max(1, payPreview));

            const n = instantiate(prefab);
            n.parent = parent;
            const start = new Vec3(from.x + (i % 3) * 4 - 4, from.y + Math.floor(i / 3) * 6, 0);
            n.setWorldPosition(start);
            const delay = i * 0.04;
            const target = to.clone();
            this.scheduleOnce(() => {
                if (!n.isValid) {
                    onOneArrive();
                    return;
                }
                flyResourceTo(n, target, GameConstants.FLY_DURATION, GameConstants.FLY_ARC_HEIGHT, () => {
                    if (n.isValid) {
                        n.destroy();
                    }
                    onOneArrive();
                });
            }, delay);
        }
    }

    private _extraTowerIds(): string[] | undefined {
        const ids = (this.extraTowerIds || []).map((s) => (s || '').trim()).filter((s) => !!s);
        return ids.length > 0 ? ids : undefined;
    }

    private _matchesPayload(data: ShopPurchasePayload): boolean {
        if (data.itemType !== this.itemType) {
            return false;
        }
        if (this.towerId && data.towerId && data.towerId !== this.towerId) {
            return false;
        }
        if (this.stallId && data.stallId && data.stallId !== this.stallId) {
            return false;
        }
        if (
            (this.itemType === ShopItemType.ExpandArea ||
                this.itemType === ShopItemType.Lumberjack ||
                this.itemType === ShopItemType.ExpandTower) &&
            data.side !== undefined &&
            data.side !== this.expandSide
        ) {
            return false;
        }
        return true;
    }

    private _ensureCollider(): void {
        let rb = this.getComponent(RigidBody2D);
        if (!rb) {
            rb = this.node.addComponent(RigidBody2D);
            rb.type = ERigidBody2DType.Kinematic;
            rb.gravityScale = 0;
            rb.allowSleep = false;
        }
        let col = this.getComponent(BoxCollider2D);
        if (!col) {
            col = this.node.addComponent(BoxCollider2D);
            col.sensor = true;
            col.size = new Size(96, 96);
        } else {
            col.sensor = true;
            if (col.size.width <= 0 || col.size.height <= 0) {
                col.size = new Size(96, 96);
            }
        }
    }

    private _bindSceneUI(): void {
        if (!this.uiRoot) {
            this.uiRoot = this._findPurchaseUiNode(this.node);
        }
        if (!this.priceLabel && this.uiRoot) {
            const priceNode =
                this.uiRoot.getChildByName('PriceLabel') ??
                this.uiRoot.getChildByName('Label') ??
                null;
            this.priceLabel =
                priceNode?.getComponent(Label) ?? this.uiRoot.getComponentInChildren(Label);
        }
    }

    private _findPurchaseUiNode(root: Node): Node | null {
        const names = [
            'PurchaseUI',
            'pref_purchase_ui',
            'pref_towerPurchase_ui-001',
            'pref_Heropurchase_ui',
            'pref_HelperPurchase_ui',
            'pref_CookedStallPurchase_ui',
            'PurchaseUI',
        ];
        for (const name of names) {
            const direct = root.getChildByName(name);
            if (direct) {
                return direct;
            }
        }
        for (const child of root.children) {
            const nested = this._findPurchaseUiNode(child);
            if (nested) {
                return nested;
            }
        }
        return null;
    }

    private _onPlayerState(data: PlayerStatePayload): void {
        this._playerPos.set(data.worldPos.x, data.worldPos.y, 0);
    }

    private _zoneWorldPos(): Vec3 {
        if (this.uiRoot && this.uiRoot.isValid) {
            return this.uiRoot.worldPosition;
        }
        return this.node.worldPosition;
    }

    private _refreshPlayerInZone(): void {
        const wp = this._zoneWorldPos();
        const dx = this._playerPos.x - wp.x;
        const dy = this._playerPos.y - wp.y;
        const radius = this.interactRadius;
        this._playerIn = dx * dx + dy * dy <= radius * radius;
    }

    private _onEnter(_s: Collider2D, other: Collider2D): void {
        if (other.getComponent(PlayerController) || other.node.getComponent(PlayerController)) {
            this._playerIn = true;
        }
    }

    private _onExit(_s: Collider2D, other: Collider2D): void {
        if (other.getComponent(PlayerController) || other.node.getComponent(PlayerController)) {
            this._playerIn = false;
        }
    }
}
