import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { ResourceType, StallType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import {
    EventBus,
    GameEvent,
    EnemyDiedPayload,
    PickupRequestPayload,
    DeliverRequestPayload,
    CoinChangedPayload,
    TreeChoppedPayload,
} from '../core/GameEvent';
import { flyResourceTo } from '../core/FlyTween';
import { ResourceEntity } from './ResourceEntity';
import { DepositPoint } from './DepositPoint';
import { Stall } from './Stall';
import { PlayerCarryStack } from '../player/PlayerCarryStack';
import { HelperNpc } from '../npc/HelperNpc';

const { ccclass, property } = _decorator;

/**
 * 资源经济系统：资源实体、拾取飞行、摊位、顾客结算。
 * 禁止：NPC 寻路与自主采集。
 */
@ccclass('ResourceEconomySystem')
export class ResourceEconomySystem extends Component {
    @property({ type: Prefab, tooltip: '生肉掉落预制体' })
    public rawMeatPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '木头掉落预制体' })
    public woodPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '烤肉预制体' })
    public cookedMeatPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '金币表现预制体 pref_coin' })
    public coinPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: '掉落资源父节点（场景里 World/Drops；运行时木头挂在此下，名 Drop_Wood）' })
    public dropRoot: Node | null = null;

    @property({ type: PlayerCarryStack, tooltip: '玩家背负堆叠' })
    public playerCarry: PlayerCarryStack | null = null;

    @property({ type: [DepositPoint], tooltip: '场景所有放置点' })
    public deposits: DepositPoint[] = [];

    @property({ type: [Stall], tooltip: '场景所有摊位' })
    public stalls: Stall[] = [];

    private _coin: number = GameConstants.PLAYER_INIT_COIN;
    private _groundResources: ResourceEntity[] = [];

    public get coin(): number {
        return this._coin;
    }

    protected onLoad(): void {
        EventBus.on(GameEvent.ENEMY_DIED, this._onEnemyDied, this);
        EventBus.on(GameEvent.REQUEST_PICKUP_RESOURCE, this._onPickupRequest, this);
        EventBus.on(GameEvent.REQUEST_PLAYER_DELIVER_STALL, this._onPlayerDeliverStall, this);
        EventBus.on(GameEvent.NPC_REQUEST_PICKUP, this._onNpcPickup, this);
        EventBus.on(GameEvent.NPC_REQUEST_DELIVER, this._onNpcDeliver, this);
        EventBus.on(GameEvent.TREE_CHOPPED, this._onTreeChopped, this);
        EventBus.on(GameEvent.CMD_CREATE_STALL, this._onCreateStall, this);
        EventBus.on(GameEvent.REQUEST_SPEND_COIN, this._onSpendRequest, this);
        // 初始金币推送 + 背部堆叠同步
        this.scheduleOnce(() => {
            this._emitCoin(0);
            this._syncCarryCoins();
        }, 0);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.ENEMY_DIED, this._onEnemyDied, this);
        EventBus.off(GameEvent.REQUEST_PICKUP_RESOURCE, this._onPickupRequest, this);
        EventBus.off(GameEvent.REQUEST_PLAYER_DELIVER_STALL, this._onPlayerDeliverStall, this);
        EventBus.off(GameEvent.NPC_REQUEST_PICKUP, this._onNpcPickup, this);
        EventBus.off(GameEvent.NPC_REQUEST_DELIVER, this._onNpcDeliver, this);
        EventBus.off(GameEvent.TREE_CHOPPED, this._onTreeChopped, this);
        EventBus.off(GameEvent.CMD_CREATE_STALL, this._onCreateStall, this);
        EventBus.off(GameEvent.REQUEST_SPEND_COIN, this._onSpendRequest, this);
    }

    public addCoin(delta: number): void {
        this._coin += delta;
        this._emitCoin(delta);
        this._syncCarryCoins();
    }

    public trySpend(amount: number): boolean {
        if (this._coin < amount) {
            return false;
        }
        this._coin -= amount;
        this._emitCoin(-amount);
        this._syncCarryCoins();
        return true;
    }

    /** 背部金币堆叠与钱包数量对齐（视觉最多 CARRY_STACK_VISUAL_MAX） */
    private _syncCarryCoins(): void {
        if (!this.playerCarry) {
            return;
        }
        // 飞币能用 Economy.coinPrefab 时，也补到背上，避免只飞不显示堆叠
        if (!this.playerCarry.coinPrefab && this.coinPrefab) {
            this.playerCarry.coinPrefab = this.coinPrefab;
        }
        this.playerCarry.setCount(ResourceType.Coin, this._coin);
    }

    private _onSpendRequest(data: { amount: number; reason?: string }): void {
        const ok = this.trySpend(data.amount);
        EventBus.emit(GameEvent.SPEND_COIN_RESULT, { success: ok, reason: data.reason });
    }

    public getDeposit(id: string): DepositPoint | null {
        return this.deposits.find((d) => d.depositId === id) ?? null;
    }

    public getStall(id: string): Stall | null {
        const local = this.stalls.find((s) => s.stallId === id) ?? null;
        if (local) {
            return local;
        }
        // 含开局 inactive 的烤肉摊
        return (
            this.node.scene?.getComponentsInChildren(Stall, true).find((s) => s.stallId === id) ?? null
        );
    }

    private _emitCoin(delta: number): void {
        const payload: CoinChangedPayload = { coin: this._coin, delta };
        EventBus.emit(GameEvent.COIN_CHANGED, payload);
    }

    private _onEnemyDied(data: EnemyDiedPayload): void {
        const pos = new Vec3(data.worldPos.x, data.worldPos.y, 0);
        if (data.byHero && data.heroDepositId) {
            const dep = this.getDeposit(data.heroDepositId);
            if (dep) {
                dep.addStock(1, pos);
                return;
            }
        }
        this._spawnGroundResource(ResourceType.RawMeat, pos);
    }

    private _onTreeChopped(data: TreeChoppedPayload): void {
        const count = Math.max(1, Math.floor(data.amount ?? 1));
        if (!(this.woodPrefab ?? this.rawMeatPrefab)) {
            console.warn(
                '[ResourceEconomy] 砍树掉落失败：请绑定 woodPrefab（pref_wood / wood）或 rawMeatPrefab',
            );
            return;
        }
        const origin = new Vec3(data.worldPos.x, data.worldPos.y, 0);
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            // 小范围散落（约 16–36），仍大于站树下瞬吸，且在 PICKUP_RANGE 内可吸
            const dist = 16 + Math.random() * 20;
            const land = new Vec3(
                origin.x + Math.cos(ang) * dist,
                origin.y + Math.sin(ang) * dist,
                0,
            );
            this._spawnGroundDrop(ResourceType.Wood, origin, land);
        }
    }

    /** 砍树掉落：抛物线落到地上，落地前不可拾取（避免站树下瞬吸） */
    private _spawnGroundDrop(type: ResourceType, from: Vec3, land: Vec3): ResourceEntity | null {
        const prefab =
            type === ResourceType.Wood
                ? this.woodPrefab ?? this.rawMeatPrefab
                : type === ResourceType.CookedMeat
                  ? this.cookedMeatPrefab ?? this.rawMeatPrefab
                  : this.rawMeatPrefab;
        if (!prefab) {
            return null;
        }
        const node = instantiate(prefab);
        const parent = this.dropRoot ?? this.node;
        node.parent = parent;
        node.name = type === ResourceType.Wood ? 'Drop_Wood' : `Drop_${type}`;
        node.setWorldPosition(from.x, from.y + 20, 0);
        let ent = node.getComponent(ResourceEntity);
        if (!ent) {
            ent = node.addComponent(ResourceEntity);
        }
        ent.resourceType = type;
        ent.amount = 1;
        ent.flying = true;
        this._groundResources.push(ent);
        const dropDur = Math.max(0.28, GameConstants.FLY_DURATION * 0.9);
        const arc = GameConstants.FLY_ARC_HEIGHT * 0.55;
        flyResourceTo(node, land, dropDur, arc, () => {
            if (ent && ent.isValid) {
                ent.flying = false;
                node.setWorldPosition(land.x, land.y, 0);
                if (type === ResourceType.Wood) {
                    this._scheduleWoodAutoDeposit(ent);
                }
            }
        });
        return ent;
    }

    /** 地面木头 2s 内未被玩家拾取 → 飞入最近 Deposit_wood，供帮手搬运 */
    private _scheduleWoodAutoDeposit(ent: ResourceEntity): void {
        const wait = GameConstants.WOOD_GROUND_AUTO_DEPOSIT_SEC;
        this.scheduleOnce(() => this._tryAutoDepositWood(ent), wait);
    }

    private _tryAutoDepositWood(ent: ResourceEntity): void {
        if (!ent?.isValid || ent.flying) {
            return;
        }
        if (this._groundResources.indexOf(ent) < 0) {
            return;
        }
        const dep = this._resolveWoodDeposit(ent.node.worldPosition);
        if (!dep) {
            return;
        }
        ent.flying = true;
        const from = ent.node.worldPosition.clone();
        const dest = dep.node.worldPosition.clone();
        flyResourceTo(ent.node, dest, undefined, undefined, () => {
            const idx = this._groundResources.indexOf(ent);
            if (idx >= 0) {
                this._groundResources.splice(idx, 1);
            }
            if (ent.node.isValid) {
                ent.node.destroy();
            }
            dep.addStock(1, from);
        });
    }

    private _resolveWoodDeposit(near: Vec3): DepositPoint | null {
        let best: DepositPoint | null = null;
        let bestD = Number.POSITIVE_INFINITY;
        for (const dep of this.deposits) {
            if (dep.resourceType !== ResourceType.Wood) {
                continue;
            }
            if (!dep.node.activeInHierarchy || dep.stock >= dep.capacity) {
                continue;
            }
            const dp = dep.node.worldPosition;
            const d = (dp.x - near.x) ** 2 + (dp.y - near.y) ** 2;
            if (d < bestD) {
                bestD = d;
                best = dep;
            }
        }
        return best;
    }

    private _spawnGroundResource(type: ResourceType, worldPos: Vec3): ResourceEntity | null {
        const prefab =
            type === ResourceType.Wood
                ? this.woodPrefab ?? this.rawMeatPrefab
                : type === ResourceType.CookedMeat
                  ? this.cookedMeatPrefab ?? this.rawMeatPrefab
                  : this.rawMeatPrefab;
        if (!prefab) {
            return null;
        }
        const node = instantiate(prefab);
        node.parent = this.dropRoot ?? this.node;
        node.setWorldPosition(worldPos.x, worldPos.y, 0);
        let ent = node.getComponent(ResourceEntity);
        if (!ent) {
            ent = node.addComponent(ResourceEntity);
        }
        ent.resourceType = type;
        ent.amount = 1;
        this._groundResources.push(ent);
        return ent;
    }

    private _onPickupRequest(data: PickupRequestPayload): void {
        if (data.requesterId !== 'player') {
            return;
        }
        // 优先拾取指定放置点
        if (data.depositId) {
            const dep = this.getDeposit(data.depositId);
            if (dep && dep.stock > 0 && this.playerCarry) {
                if (dep.resourceType === ResourceType.Coin) {
                    this._pickupCoinFromDeposit(dep, data);
                } else {
                    const take = dep.takeStock(1);
                    if (take > 0) {
                        const from = new Vec3(data.worldPos.x, data.worldPos.y, 0);
                        this._flyToPlayer(dep.resourceType, from);
                    }
                }
            }
            return;
        }
        // 靠近金币地块：按结算数值拾取进钱包 + 背负表现
        if (this._tryPickupNearbyCoinDeposit(data)) {
            return;
        }
        // 拾取地面最近资源
        this._pickupNearestGround(data);
    }

    /** 靠近金币放置点则拾取 1 枚（每帧请求可连续吸完） */
    private _tryPickupNearbyCoinDeposit(data: PickupRequestPayload): boolean {
        const range = GameConstants.PICKUP_RANGE + 20;
        const r2 = range * range;
        for (const dep of this.deposits) {
            if (dep.resourceType !== ResourceType.Coin || dep.stock <= 0) {
                continue;
            }
            const dp = dep.node.worldPosition;
            const dx = dp.x - data.worldPos.x;
            const dy = dp.y - data.worldPos.y;
            if (dx * dx + dy * dy > r2) {
                continue;
            }
            return this._pickupCoinFromDeposit(dep, data);
        }
        return false;
    }

    private _pickupCoinFromDeposit(dep: DepositPoint, data: PickupRequestPayload): boolean {
        const take = dep.takeStock(1);
        if (take <= 0) {
            return false;
        }
        // 结算进钱包，并同步背部堆叠
        this.addCoin(take);
        const from = new Vec3(dep.node.worldPosition.x, dep.node.worldPosition.y, 0);
        // 仅飞行动画；勿再 add，否则与 _syncCarryCoins 重复
        this._flyCoinVisualOnly(from);
        return true;
    }

    /** 金币飞向背部的纯表现（不改数量） */
    private _flyCoinVisualOnly(from: Vec3): void {
        const prefab = this._prefabFor(ResourceType.Coin);
        const carryRoot = this.playerCarry?.carryRoot;
        if (!prefab || !carryRoot) {
            return;
        }
        const n = instantiate(prefab);
        n.parent = this.dropRoot ?? this.node;
        n.setWorldPosition(from);
        flyResourceTo(n, carryRoot.worldPosition, undefined, undefined, () => {
            if (n.isValid) {
                n.destroy();
            }
        });
    }

    private _pickupNearestGround(data: PickupRequestPayload): void {
        // 只清无效实体；飞行中的仍保留，落地后才能继续被吸（勿用 !flying 过滤掉列表项）
        this._groundResources = this._groundResources.filter((r) => r && r.isValid);
        let best: ResourceEntity | null = null;
        const range = GameConstants.PICKUP_RANGE;
        let bestD = range * range;
        for (const r of this._groundResources) {
            if (r.flying) {
                continue;
            }
            if (data.resourceType !== undefined && r.resourceType !== data.resourceType) {
                continue;
            }
            const p = r.node.worldPosition;
            const d = (p.x - data.worldPos.x) ** 2 + (p.y - data.worldPos.y) ** 2;
            if (d < bestD) {
                bestD = d;
                best = r;
            }
        }
        if (!best || !this.playerCarry) {
            return;
        }
        best.flying = true;
        const type = best.resourceType;
        const from = best.node.worldPosition.clone();
        const carryRoot = this.playerCarry.carryRoot;
        const dest = carryRoot ? carryRoot.worldPosition : new Vec3(data.worldPos.x, data.worldPos.y, 0);
        flyResourceTo(best.node, dest, undefined, undefined, () => {
            if (best && best.isValid) {
                const idx = this._groundResources.indexOf(best);
                if (idx >= 0) {
                    this._groundResources.splice(idx, 1);
                }
                best.node.destroy();
            }
            this.playerCarry?.add(type, 1);
            EventBus.emit(GameEvent.RESOURCE_PICKED, { type, requesterId: 'player' });
        });
    }

    private _flyToPlayer(type: ResourceType, from: Vec3, onDone?: () => void): void {
        const prefab = this._prefabFor(type);
        const carryRoot = this.playerCarry?.carryRoot;
        if (!prefab || !carryRoot) {
            this.playerCarry?.add(type, 1);
            onDone?.();
            return;
        }
        const n = instantiate(prefab);
        n.parent = this.dropRoot ?? this.node;
        n.setWorldPosition(from);
        flyResourceTo(n, carryRoot.worldPosition, undefined, undefined, () => {
            if (n.isValid) {
                n.destroy();
            }
            this.playerCarry?.add(type, 1);
            EventBus.emit(GameEvent.RESOURCE_PICKED, { type, requesterId: 'player' });
            onDone?.();
        });
    }

    private _prefabFor(type: ResourceType): Prefab | null {
        switch (type) {
            case ResourceType.Wood:
                return this.woodPrefab ?? this.rawMeatPrefab;
            case ResourceType.CookedMeat:
                return this.cookedMeatPrefab ?? this.rawMeatPrefab;
            case ResourceType.Coin:
                return this.coinPrefab ?? this.playerCarry?.coinPrefab ?? null;
            default:
                return this.rawMeatPrefab;
        }
    }

    private _onNpcPickup(data: PickupRequestPayload): void {
        if (!data.depositId) {
            return;
        }
        const dep = this.getDeposit(data.depositId);
        if (!dep || dep.stock <= 0) {
            return;
        }
        // 帮手：一次取走储肉地全部（无搬运上限）
        const take = dep.takeStock(dep.stock);
        if (take > 0) {
            EventBus.emit(GameEvent.RESOURCE_PICKED, {
                type: dep.resourceType,
                requesterId: data.requesterId,
                amount: take,
            });
        }
    }

    private _onNpcDeliver(data: DeliverRequestPayload): void {
        const stall = this.getStall(data.stallId);
        if (!stall) {
            return;
        }
        const helpers = this.node.scene?.getComponentsInChildren(HelperNpc) ?? [];
        const helper = helpers.find((h) => h.npcId === data.requesterId);
        const fromPos = helper
            ? helper.node.worldPosition.clone()
            : stall.node.worldPosition.clone();
        const prefab = this._prefabFor(data.resourceType) ?? stall.tradeVisualPrefab;
        if (!stall.tradeVisualPrefab && prefab) {
            stall.tradeVisualPrefab = prefab;
        }
        // 烤肉摊收下生肉 → 先全部堆到 PlaceRoot（烤制由 Stall 队列处理）
        if (
            stall.stallType === StallType.CookedMeat &&
            data.resourceType === ResourceType.RawMeat
        ) {
            if (!stall.tradeVisualPrefab) {
                stall.tradeVisualPrefab = this.cookedMeatPrefab ?? this.rawMeatPrefab;
            }
            if (!stall.rawVisualPrefab) {
                stall.rawVisualPrefab = this.rawMeatPrefab;
            }
            const amount = data.amount ?? 1;
            stall.receiveResource(fromPos, this.rawMeatPrefab, amount, () => {
                EventBus.emit(GameEvent.RESOURCE_DELIVERED, data);
            });
            return;
        }
        stall.receiveResource(fromPos, prefab, data.amount, () => {
            EventBus.emit(GameEvent.RESOURCE_DELIVERED, data);
        });
    }

    private _onCreateStall(data: { stallType: StallType; stallId: string }): void {
        const stall = this.getStall(data.stallId);
        if (stall) {
            stall.node.active = true;
            if (this.stalls.indexOf(stall) < 0) {
                this.stalls.push(stall);
            }
            if (data.stallType === StallType.CookedMeat) {
                stall.setHelperActive(true);
            }
        }
    }

    private _onPlayerDeliverStall(data: { stallId: string }): void {
        this.playerDeliverToStall(data.stallId);
    }

    /**
     * 玩家向摊位上交：扣背负 → 飞向 PlaceRoot 堆叠 → 落地后才加库存并允许交易。
     */
    public playerDeliverToStall(stallId: string): void {
        const stall = this.getStall(stallId);
        if (!stall || !this.playerCarry) {
            return;
        }
        if (stall.stallType === StallType.CookedMeat) {
            const taken = this.playerCarry.remove(ResourceType.RawMeat, 1);
            if (taken > 0) {
                if (!stall.tradeVisualPrefab) {
                    stall.tradeVisualPrefab = this.cookedMeatPrefab ?? this.rawMeatPrefab;
                }
                if (!stall.rawVisualPrefab) {
                    stall.rawVisualPrefab = this.rawMeatPrefab;
                }
                stall.receiveResource(
                    this.playerCarry.carryRoot?.worldPosition ?? this.playerCarry.node.worldPosition,
                    this.rawMeatPrefab,
                    taken,
                );
            }
            return;
        }
        const type = stall.tradeResourceType;
        if (this.playerCarry.getCount(type) <= 0) {
            return;
        }
        const taken = this.playerCarry.remove(type, 1);
        if (taken <= 0) {
            return;
        }
        const from =
            this.playerCarry.carryRoot?.worldPosition.clone() ??
            this.playerCarry.node.worldPosition.clone();
        const prefab = this._prefabFor(type) ?? stall.tradeVisualPrefab;
        if (!stall.tradeVisualPrefab && prefab) {
            stall.tradeVisualPrefab = prefab;
        }
        stall.receiveResource(from, prefab, taken);
    }
}
