import {
    _decorator,
    Component,
    Node,
    Prefab,
    instantiate,
    Vec3,
    Collider2D,
    Contact2DType,
    Enum,
    UITransform,
    js,
} from 'cc';
import { StallType, ResourceType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { EventBus, GameEvent, PlayerStatePayload } from '../core/GameEvent';
import { flyResourceTo } from '../core/FlyTween';
import { CustomerQueue } from './CustomerQueue';
import { DepositPoint } from './DepositPoint';
import { PlayerController } from '../player/PlayerController';
import { PlayerCarryStack } from '../player/PlayerCarryStack';
import { SortingOrder2D } from '../core/SortingOrder2D';

const { ccclass, property } = _decorator;

/**
 * 摊位：
 * - 生肉/木头：InteractZone 上交 → PlaceRoot 堆叠 → 售卖
 * - 烤肉：上交生肉全部堆到 PlaceRoot →（卸完后）逐块 PlaceRoot→CookPoint 烤 2s → CookedPlace 成烤肉堆叠 → 售卖
 */
@ccclass('Stall')
export class Stall extends Component {
    @property({ tooltip: '摊位唯一 ID' })
    public stallId: string = 'stall_raw';

    @property({ type: Enum(StallType), tooltip: '摊位类型' })
    public stallType: StallType = StallType.RawMeat;

    @property({
        type: Node,
        tooltip:
            'PlaceRoot：生肉/木头=成品堆叠；烤肉摊=生肉暂存堆叠（全部卸完后再飞去 CookPoint）',
    })
    public placeRoot: Node | null = null;

    @property({ type: Node, tooltip: 'CookPoint：烤肉摊烤制点（生肉在此等待 cookDuration）' })
    public cookPoint: Node | null = null;

    @property({ type: Node, tooltip: 'CookedPlace：烤好后的成品堆叠（烤肉摊货架）' })
    public cookedPlacePoint: Node | null = null;

    @property({ type: Node, tooltip: '交互触发区 InteractZone' })
    public interactZone: Node | null = null;

    @property({ type: CustomerQueue, tooltip: '顾客队列' })
    public customerQueue: CustomerQueue | null = null;

    @property({ type: DepositPoint, tooltip: '专属储肉/资源放置点' })
    public boundDeposit: DepositPoint | null = null;

    @property({ type: DepositPoint, tooltip: '金币产出放置点' })
    public coinDeposit: DepositPoint | null = null;

    @property({ type: Prefab, tooltip: '成品表现：生肉摊=生肉；烤肉摊=烤肉（售卖/CookedPlace）' })
    public tradeVisualPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '烤肉摊生肉表现（PlaceRoot/CookPoint）；空则用 tradeVisualPrefab' })
    public rawVisualPrefab: Prefab | null = null;

    @property({ tooltip: '竖直堆叠间距' })
    public stackGap: number = GameConstants.CARRY_STACK_GAP;

    @property({ tooltip: 'CookPoint 烤制时长（秒）' })
    public cookDuration: number = GameConstants.COOK_DURATION_SEC;

    @property({ tooltip: '交互区判定半径' })
    public interactRadius: number = 70;

    @property({ tooltip: '上交/交易间隔（秒）' })
    public tradeInterval: number = GameConstants.STALL_DELIVER_INTERVAL;

    @property({ tooltip: '肉/资源飞入 PlaceRoot 的时长（秒）' })
    public deliverFlyDuration: number = GameConstants.STALL_DELIVER_FLY_DURATION;

    @property({ tooltip: '上交飞行抛物线高度' })
    public deliverFlyArc: number = GameConstants.STALL_DELIVER_FLY_ARC;

    private _stock: number = 0;
    private _playerInZone: boolean = false;
    private _helperInZone: boolean = false;
    private _hasHelper: boolean = false;
    /** CookPoint 占用或 PlaceRoot→CookPoint→CookedPlace 管道忙碌 */
    private _cooking: boolean = false;
    /** 飞向 PlaceRoot（生肉暂存）的件数 */
    private _incomingFlights: number = 0;
    /** 飞向 CookedPlace / 普通摊 PlaceRoot 成品货架的件数 */
    private _shelfIncoming: number = 0;
    private _tradeCooldown: number = 0;
    private _playerPos: Vec3 = new Vec3();
    /** 烤肉：PlaceRoot 上等待烤制的生肉 */
    private _rawVisuals: Node[] = [];
    /** 成品货架表现（生肉摊 PlaceRoot / 烤肉摊 CookedPlace） */
    private _placeVisuals: Node[] = [];

    public get stock(): number {
        return this._stock;
    }

    /** 上架飞行中 / 烤制中（帮手用来判断是否还要留在摊位） */
    public get isPlacing(): boolean {
        return this._incomingFlights > 0 || this._cooking || this._shelfIncoming > 0;
    }

    /** 烤肉：PlaceRoot 还有生肉或正在烤/卸货 */
    public get hasPendingCookWork(): boolean {
        if (this.stallType !== StallType.CookedMeat) {
            return this.isPlacing;
        }
        return this._rawVisuals.length > 0 || this.isPlacing;
    }

    public get hasHelper(): boolean {
        return this._hasHelper;
    }

    public get playerInZone(): boolean {
        return this._playerInZone;
    }

    public get helperInZone(): boolean {
        return this._helperInZone;
    }

    public get tradeResourceType(): ResourceType {
        switch (this.stallType) {
            case StallType.CookedMeat:
                return ResourceType.CookedMeat;
            case StallType.Wood:
                return ResourceType.Wood;
            default:
                return ResourceType.RawMeat;
        }
    }

    protected onLoad(): void {
        // 场景若仍序列化旧间隔，对齐到更快的默认值
        if (this.tradeInterval > GameConstants.STALL_DELIVER_INTERVAL) {
            this.tradeInterval = GameConstants.STALL_DELIVER_INTERVAL;
        }
        this._autoBindRefs();
        const zone = this.interactZone ?? this.node;
        const col = zone.getComponent(Collider2D);
        if (col) {
            col.on(Contact2DType.BEGIN_CONTACT, this._onEnter, this);
            col.on(Contact2DType.END_CONTACT, this._onExit, this);
        }
        if (this.boundDeposit) {
            this.boundDeposit.boundStallId = this.stallId;
        }
        EventBus.on(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
    }

    protected onDestroy(): void {
        const zone = this.interactZone ?? this.node;
        const col = zone.getComponent(Collider2D);
        if (col) {
            col.off(Contact2DType.BEGIN_CONTACT, this._onEnter, this);
            col.off(Contact2DType.END_CONTACT, this._onExit, this);
        }
        EventBus.off(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
    }

    protected update(dt: number): void {
        this._refreshPlayerInZoneByDistance();
        if (this.stallType === StallType.CookedMeat) {
            this._tryProcessCookQueue();
        }

        this._tradeCooldown -= dt;
        if (this._tradeCooldown > 0) {
            return;
        }

        let acted = false;
        if (this._playerInZone) {
            EventBus.emit(GameEvent.REQUEST_PLAYER_DELIVER_STALL, { stallId: this.stallId });
            acted = true;
        }

        const canTrade =
            this._stock > 0 &&
            !this._playerStillUnloading() &&
            (this._hasHelper || this._playerInZone) &&
            !!this.customerQueue?.head &&
            !this.customerQueue.isTrading &&
            this.customerQueue.head.openDemand > 0;
        if (canTrade && this.tryTradeOnce()) {
            acted = true;
        }
        if (acted) {
            this._tradeCooldown = this.tradeInterval;
        }
    }

    private _playerStillUnloading(): boolean {
        if (!this._playerInZone) {
            return false;
        }
        const carry = this.node.scene?.getComponentInChildren(PlayerCarryStack) ?? null;
        if (!carry) {
            return false;
        }
        if (this.stallType === StallType.CookedMeat) {
            return carry.getCount(ResourceType.RawMeat) > 0;
        }
        return carry.getCount(this.tradeResourceType) > 0;
    }

    private _helperStillUnloading(): boolean {
        const scene = this.node.scene;
        if (!scene) {
            return false;
        }
        const ctor = js.getClassByName('HelperNpc');
        if (!ctor) {
            return false;
        }
        const helpers = scene.getComponentsInChildren(ctor) as unknown as Array<{
            stall: Stall | null;
            carrying: number;
        }>;
        return helpers.some((h) => h.stall === this && h.carrying > 0);
    }

    public setHelperActive(active: boolean): void {
        this._hasHelper = active;
    }

    public addStock(amount: number): void {
        this._stock += amount;
        this._ensurePlaceVisuals();
        EventBus.emit(GameEvent.STALL_STOCK_CHANGED, {
            stallId: this.stallId,
            stock: this._stock,
            type: this.stallType,
        });
    }

    public consumeStock(amount: number): number {
        const take = Math.min(amount, this._stock);
        this._stock -= take;
        this._ensurePlaceVisuals();
        EventBus.emit(GameEvent.STALL_STOCK_CHANGED, {
            stallId: this.stallId,
            stock: this._stock,
            type: this.stallType,
        });
        return take;
    }

    /**
     * 上交资源：
     * - 烤肉摊：生肉全部飞入 PlaceRoot 堆叠（不立刻烤）
     * - 其它：飞入 PlaceRoot 并加可售库存
     */
    public receiveResource(
        fromWorldPos: Vec3,
        visualPrefab: Prefab | null,
        amount: number = 1,
        onDone?: () => void,
    ): void {
        if (amount <= 0) {
            onDone?.();
            return;
        }
        if (this.stallType === StallType.CookedMeat) {
            this._receiveRawToPlaceRoot(fromWorldPos, visualPrefab, amount, onDone);
            return;
        }

        const prefab = visualPrefab ?? this.tradeVisualPrefab;
        const root = this.placeRoot ?? this.node;
        if (!prefab) {
            this.addStock(amount);
            onDone?.();
            return;
        }

        this._incomingFlights += amount;
        this._shelfIncoming += amount;
        let left = amount;
        const spawnOne = (): void => {
            if (left <= 0) {
                onDone?.();
                return;
            }
            left--;
            const n = this._spawnUnder(root, fromWorldPos, prefab);
            const provisional = this._placeVisuals.length + (amount - left - 1);
            const dest = this._stackWorldPos(root, Math.max(provisional, this._placeVisuals.length));
            flyResourceTo(
                n,
                dest,
                this.deliverFlyDuration,
                this.deliverFlyArc,
                () => {
                    this._incomingFlights = Math.max(0, this._incomingFlights - 1);
                    this._shelfIncoming = Math.max(0, this._shelfIncoming - 1);
                    if (!n.isValid) {
                        this.addStock(1);
                        spawnOne();
                        return;
                    }
                    this._landFinishedVisual(n, root);
                    spawnOne();
                },
            );
        };
        spawnOne();
    }

    /** @deprecated 烤肉改为 receiveResource + 自动烤制队列；保留空实现防旧调用 */
    public cookRawMeat(
        fromWorldPos: Vec3,
        onDone?: () => void,
        cookVisualPrefab?: Prefab | null,
    ): void {
        this.receiveResource(fromWorldPos, cookVisualPrefab ?? this.rawVisualPrefab, 1, onDone);
    }

    public tryTradeOnce(): boolean {
        if (this._stock <= 0 || !this.customerQueue || this.customerQueue.isTrading) {
            return false;
        }
        const head = this.customerQueue.head;
        if (!head || head.openDemand <= 0) {
            return false;
        }
        if (!head.reserveInbound()) {
            return false;
        }
        if (this.consumeStock(1) <= 0) {
            head.cancelInbound();
            return false;
        }
        const root = this._finishedRoot();
        const from = root.worldPosition;
        const finishDeliver = (): void => {
            if (!head.isValid) {
                return;
            }
            const ok = this.customerQueue?.tryDeliverOne((coin) => {
                if (this.coinDeposit) {
                    this.coinDeposit.addStock(coin, head.node.worldPosition);
                } else {
                    EventBus.emit(GameEvent.COIN_CHANGED, { coin: coin, delta: coin });
                }
            });
            if (!ok) {
                head.cancelInbound();
            }
        };
        if (this.tradeVisualPrefab && head) {
            const v = this._spawnUnder(root, from, this.tradeVisualPrefab);
            flyResourceTo(v, head.node, undefined, undefined, () => {
                if (v.isValid) {
                    v.destroy();
                }
                // 肉飞到顾客身上后再扣需求 / 可能离场
                finishDeliver();
            });
        } else {
            finishDeliver();
        }
        return true;
    }

    // —— 烤肉专用 ——

    private _receiveRawToPlaceRoot(
        fromWorldPos: Vec3,
        visualPrefab: Prefab | null,
        amount: number,
        onDone?: () => void,
    ): void {
        const root = this.placeRoot;
        if (!root) {
            console.warn(`[Stall] ${this.stallId} 缺 PlaceRoot，无法暂存生肉`);
            onDone?.();
            return;
        }
        const prefab = visualPrefab ?? this.rawVisualPrefab ?? this.tradeVisualPrefab;
        if (!prefab) {
            // 无表现也记入逻辑队列：用空节点占位
            for (let i = 0; i < amount; i++) {
                const ghost = new Node('RawGhost');
                ghost.parent = root;
                ghost.setPosition(0, this._rawVisuals.length * this.stackGap, 0);
                this._rawVisuals.push(ghost);
            }
            onDone?.();
            return;
        }

        this._incomingFlights += amount;
        let left = amount;
        const spawnOne = (): void => {
            if (left <= 0) {
                onDone?.();
                return;
            }
            left--;
            const n = this._spawnUnder(root, fromWorldPos, prefab);
            const provisional = this._rawVisuals.length + (amount - left - 1);
            const dest = this._stackWorldPos(root, Math.max(provisional, this._rawVisuals.length));
            flyResourceTo(
                n,
                dest,
                this.deliverFlyDuration,
                this.deliverFlyArc,
                () => {
                    this._incomingFlights = Math.max(0, this._incomingFlights - 1);
                    if (!n.isValid) {
                        const ghost = new Node('RawGhost');
                        ghost.parent = root;
                        this._rawVisuals.push(ghost);
                        this._relayoutRawVisuals();
                        spawnOne();
                        return;
                    }
                    n.parent = root;
                    n.setPosition(0, this._rawVisuals.length * this.stackGap, 0);
                    this._applySort(n);
                    this._rawVisuals.push(n);
                    spawnOne();
                },
            );
        };
        spawnOne();
    }

    /**
     * 条件：身上已卸完 + PlaceRoot 飞行落地 + CookPoint 空闲
     * → 取 PlaceRoot 顶层生肉 → CookPoint 等 cookDuration → 变烤肉飞入 CookedPlace
     */
    private _tryProcessCookQueue(): void {
        if (this._cooking) {
            return;
        }
        if (this._incomingFlights > 0) {
            return;
        }
        if (this._playerStillUnloading() || this._helperStillUnloading()) {
            return;
        }
        if (this._rawVisuals.length === 0) {
            return;
        }
        const cookPt = this.cookPoint;
        const cookedRoot = this.cookedPlacePoint;
        if (!cookPt || !cookedRoot) {
            console.warn(`[Stall] ${this.stallId} 缺 CookPoint/CookedPlace`);
            return;
        }
        this._startCookOne(cookPt, cookedRoot);
    }

    private _startCookOne(cookPt: Node, cookedRoot: Node): void {
        const raw = this._rawVisuals.pop();
        if (!raw || !raw.isValid) {
            return;
        }
        this._relayoutRawVisuals();
        this._cooking = true;

        // PlaceRoot → CookPoint（保持挂在飞行过程所属节点：先挂 cookPt）
        const fromWp = raw.worldPosition.clone();
        raw.parent = cookPt;
        raw.setWorldPosition(fromWp.x, fromWp.y, 0);
        flyResourceTo(raw, cookPt.worldPosition, undefined, undefined, () => {
            if (!raw.isValid) {
                this._cooking = false;
                this.addStock(1);
                return;
            }
            raw.parent = cookPt;
            raw.setPosition(0, 0, 0);
            this._applySort(raw);

            this.scheduleOnce(() => {
                if (!raw.isValid) {
                    this._cooking = false;
                    this.addStock(1);
                    return;
                }
                const cookWp = new Vec3(raw.worldPosition.x, raw.worldPosition.y, 0);
                raw.destroy();

                const cookedPrefab = this.tradeVisualPrefab ?? this.rawVisualPrefab;
                if (!cookedPrefab) {
                    this._cooking = false;
                    this.addStock(1);
                    return;
                }
                // CookPoint → CookedPlace：一开始就挂在 CookedPlace 下
                const cooked = this._spawnUnder(cookedRoot, cookWp, cookedPrefab);
                this._shelfIncoming += 1;
                const stackIndex = this._placeVisuals.length;
                const dest = this._stackWorldPos(cookedRoot, stackIndex);
                flyResourceTo(cooked, dest, undefined, undefined, () => {
                    this._shelfIncoming = Math.max(0, this._shelfIncoming - 1);
                    this._cooking = false;
                    if (!cooked.isValid) {
                        this.addStock(1);
                        this._tryProcessCookQueue();
                        return;
                    }
                    this._landFinishedVisual(cooked, cookedRoot);
                    this._tryProcessCookQueue();
                });
            }, this.cookDuration);
        });
    }

    private _relayoutRawVisuals(): void {
        const root = this.placeRoot;
        if (!root) {
            return;
        }
        for (let i = 0; i < this._rawVisuals.length; i++) {
            const n = this._rawVisuals[i];
            if (!n?.isValid) {
                continue;
            }
            n.parent = root;
            n.setPosition(0, i * this.stackGap, 0);
        }
    }

    private _finishedRoot(): Node {
        if (this.stallType === StallType.CookedMeat) {
            return this.cookedPlacePoint ?? this.placeRoot ?? this.node;
        }
        return this.placeRoot ?? this.node;
    }

    private _spawnUnder(parent: Node, worldPos: Vec3, prefab: Prefab): Node {
        const n = instantiate(prefab);
        n.parent = parent;
        n.setWorldPosition(worldPos.x, worldPos.y, 0);
        return n;
    }

    private _applySort(n: Node): void {
        const sort = n.getComponent(SortingOrder2D) ?? n.getComponentInChildren(SortingOrder2D);
        sort?.applyOrder();
    }

    private _landFinishedVisual(n: Node, root: Node): void {
        this._stock += 1;
        const maxVis = GameConstants.STALL_STACK_VISUAL_MAX;
        if (this._placeVisuals.length >= maxVis) {
            n.destroy();
        } else {
            const stackIndex = this._placeVisuals.length;
            n.parent = root;
            n.setPosition(0, stackIndex * this.stackGap, 0);
            this._applySort(n);
            this._placeVisuals.push(n);
        }
        EventBus.emit(GameEvent.STALL_STOCK_CHANGED, {
            stallId: this.stallId,
            stock: this._stock,
            type: this.stallType,
        });
    }

    private _stackWorldPos(root: Node, index: number): Vec3 {
        const wp = root.worldPosition;
        const clamped = Math.min(index, GameConstants.STALL_STACK_VISUAL_MAX - 1);
        return new Vec3(wp.x, wp.y + Math.max(0, clamped) * this.stackGap, 0);
    }

    private _ensurePlaceVisuals(): void {
        const prefab = this.tradeVisualPrefab;
        const root = this._finishedRoot();
        if (!prefab) {
            return;
        }
        const visualTarget = Math.min(this._stock, GameConstants.STALL_STACK_VISUAL_MAX);
        while (this._placeVisuals.length < visualTarget) {
            const idx = this._placeVisuals.length;
            const n = instantiate(prefab);
            n.parent = root;
            n.setPosition(0, idx * this.stackGap, 0);
            this._placeVisuals.push(n);
        }
        while (this._placeVisuals.length > visualTarget) {
            const n = this._placeVisuals.pop();
            n?.destroy();
        }
    }

    private _autoBindRefs(): void {
        if (!this.interactZone) {
            this.interactZone = this.node.getChildByName('InteractZone');
        }
        if (!this.cookPoint) {
            this.cookPoint =
                this.node.getChildByName('CookPoint') ??
                this.node.getChildByName('Cook') ??
                null;
        }
        if (!this.cookedPlacePoint) {
            this.cookedPlacePoint =
                this.node.getChildByName('CookedPlace') ??
                this.node.getChildByName('CookedPlacePoint') ??
                null;
        }
        if (!this.placeRoot) {
            this.placeRoot = this.node.getChildByName('PlaceRoot');
        }
        if (!this.customerQueue) {
            this.customerQueue =
                this.node.getComponentInChildren(CustomerQueue) ??
                this.node.getChildByName('CustomerQueue')?.getComponent(CustomerQueue) ??
                null;
        }
        if (this.customerQueue && this.stallType === StallType.CookedMeat) {
            this.customerQueue.demandType = ResourceType.CookedMeat;
        }
        if (!this.coinDeposit) {
            const deps = this.node.scene?.getComponentsInChildren(DepositPoint, true) ?? [];
            this.coinDeposit =
                deps.find((d) => d.depositId === 'deposit_coin' || d.node.name.indexOf('Coin') >= 0) ??
                null;
        }
    }

    private _onPlayerState(data: PlayerStatePayload): void {
        this._playerPos.set(data.worldPos.x, data.worldPos.y, 0);
    }

    private _refreshPlayerInZoneByDistance(): void {
        const zone = this.interactZone ?? this.node;
        const zp = zone.worldPosition;
        const dx = this._playerPos.x - zp.x;
        const dy = this._playerPos.y - zp.y;
        let radius = this.interactRadius;
        const ui = zone.getComponent(UITransform);
        if (ui) {
            const hw = Math.max(ui.width, ui.height);
            if (hw > 0 && hw < 400) {
                radius = Math.max(radius, hw * 0.5 + 20);
            }
        }
        this._playerInZone = dx * dx + dy * dy <= radius * radius;
    }

    private _onEnter(_self: Collider2D, other: Collider2D): void {
        if (other.getComponent(PlayerController) || other.node.getComponent(PlayerController)) {
            this._playerInZone = true;
        }
        if (other.node.name.indexOf('Helper') >= 0 || other.node.getComponent('HelperNpc')) {
            this._helperInZone = true;
        }
    }

    private _onExit(_self: Collider2D, other: Collider2D): void {
        if (other.getComponent(PlayerController) || other.node.getComponent(PlayerController)) {
            this._playerInZone = false;
        }
        if (other.node.name.indexOf('Helper') >= 0 || other.node.getComponent('HelperNpc')) {
            this._helperInZone = false;
        }
    }
}
