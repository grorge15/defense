import { _decorator, Component, Node, Vec3 } from 'cc';
import { HelperTask, NpcWorkState, ResourceType, StallType } from '../core/Enums';
import { EventBus, GameEvent } from '../core/GameEvent';
import { Stall } from '../economy/Stall';
import { DepositPoint } from '../economy/DepositPoint';

const { ccclass, property } = _decorator;

/**
 * 帮手：PlaceRoot 有货或正在上架/烤制时 → 站 InteractZone 售卖；
 * 仅当 PlaceRoot 耗尽且无在途上架时，才去储肉地取货运回。
 */
@ccclass('HelperNpc')
export class HelperNpc extends Component {
    @property({ tooltip: 'NPC 唯一 ID' })
    public npcId: string = 'helper_0';

    @property({ type: Stall, tooltip: '绑定摊位' })
    public stall: Stall | null = null;

    @property({ type: DepositPoint, tooltip: '绑定放置点' })
    public deposit: DepositPoint | null = null;

    @property({ tooltip: '移动速度' })
    public moveSpeed: number = 120;

    @property({ tooltip: '摊位交互站位点' })
    public stallStandPoint: Node | null = null;

    private _state: NpcWorkState = NpcWorkState.Idle;
    private _task: HelperTask = HelperTask.Idle;
    private _carrying: number = 0;
    private _carryType: ResourceType = ResourceType.RawMeat;
    private _targetPos: Vec3 | null = null;
    private _activeDeposit: DepositPoint | null = null;
    /** 已发出上交请求，等飞行落地（期间不离开交互区去取货） */
    private _awaitingDeliver: boolean = false;

    public get carrying(): number {
        return this._carrying;
    }

    public get workState(): NpcWorkState {
        return this._state;
    }

    protected onLoad(): void {
        EventBus.on(GameEvent.RESOURCE_PICKED, this._onPicked, this);
        EventBus.on(GameEvent.RESOURCE_DELIVERED, this._onDelivered, this);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.RESOURCE_PICKED, this._onPicked, this);
        EventBus.off(GameEvent.RESOURCE_DELIVERED, this._onDelivered, this);
    }

    protected start(): void {
        this._activateStallHelper();
        this._goIdleAtStall();
    }

    /** 由 NpcAi 在赋值 stall/deposit 后调用，确保 setHelperActive */
    public bindWorkplace(stall: Stall | null, deposit: DepositPoint | null): void {
        this.stall = stall;
        this.deposit = deposit;
        this._activateStallHelper();
        this._goIdleAtStall();
    }

    protected update(dt: number): void {
        if (this._targetPos) {
            if (this._moveToward(this._targetPos, dt)) {
                this._targetPos = null;
                this._onArrive();
            }
            return;
        }
        this._think();
    }

    private _activateStallHelper(): void {
        if (this.stall) {
            this.stall.setHelperActive(true);
        }
    }

    private _think(): void {
        if (!this.stall) {
            return;
        }
        // 身上有货 → 运回摊位上交
        if (this._carrying > 0) {
            this._task = HelperTask.TradeAtStall;
            this._state = NpcWorkState.Working;
            const stand = this.stallStandPoint ?? this.stall.interactZone ?? this.stall.node;
            this._targetPos = stand.worldPosition.clone();
            return;
        }
        // 上架/烤制中 / PlaceRoot 有生肉或成品 → 留在 InteractZone
        if (
            this._awaitingDeliver ||
            this.stall.isPlacing ||
            this.stall.hasPendingCookWork ||
            this.stall.stock > 0
        ) {
            this._goIdleAtStall();
            return;
        }
        // PlaceRoot 耗尽：去有货放置点取货（生肉 / 木头）
        const pickupDep = this._resolvePickupDeposit();
        if (pickupDep && pickupDep.stock > 0) {
            this._task = HelperTask.PickupDeposit;
            this._state = NpcWorkState.Working;
            this._targetPos = pickupDep.node.worldPosition.clone();
            this._activeDeposit = pickupDep;
            return;
        }
        this._goIdleAtStall();
    }

    private _resolvePickupDeposit(): DepositPoint | null {
        if (this.stall?.stallType === StallType.Wood) {
            return this._resolveWoodDeposit();
        }
        return this._resolveMeatDeposit();
    }

    private _resolveWoodDeposit(): DepositPoint | null {
        if (this.deposit?.resourceType === ResourceType.Wood && this.deposit.stock > 0) {
            return this.deposit;
        }
        if (
            this.stall?.boundDeposit?.resourceType === ResourceType.Wood &&
            this.stall.boundDeposit.stock > 0
        ) {
            return this.stall.boundDeposit;
        }
        const stallId = this.stall?.stallId ?? '';
        const deps = this.node.scene?.getComponentsInChildren(DepositPoint, true) ?? [];
        return (
            deps.find(
                (d) =>
                    d.resourceType === ResourceType.Wood &&
                    d.stock > 0 &&
                    (d.boundStallId === stallId || d === this.deposit),
            ) ?? null
        );
    }

    private _resolveMeatDeposit(): DepositPoint | null {
        if (this.deposit && this.deposit.stock > 0) {
            return this.deposit;
        }
        const stallId = this.stall?.stallId ?? '';
        const deps = this.node.scene?.getComponentsInChildren(DepositPoint, true) ?? [];
        const acceptRawForCook =
            this.stall?.stallType === StallType.CookedMeat || stallId === 'stall_cooked';
        const bound = deps.filter((d) => {
            if (d.resourceType !== ResourceType.RawMeat || d.stock <= 0) {
                return false;
            }
            if (d === this.stall?.boundDeposit || d === this.deposit) {
                return true;
            }
            if (d.boundStallId === stallId) {
                return true;
            }
            if (acceptRawForCook && (d.boundStallId === 'stall_raw' || !d.boundStallId)) {
                return true;
            }
            return false;
        });
        return bound[0] ?? null;
    }

    private _goIdleAtStall(): void {
        this._task = HelperTask.Idle;
        this._state = NpcWorkState.Idle;
        if (!this.stall) {
            return;
        }
        const stand = this.stallStandPoint ?? this.stall.interactZone ?? this.stall.node;
        const wp = stand.worldPosition;
        const cur = this.node.worldPosition;
        const dx = wp.x - cur.x;
        const dy = wp.y - cur.y;
        if (dx * dx + dy * dy > 36) {
            this._targetPos = wp.clone();
        }
    }

    private _onArrive(): void {
        if (this._task === HelperTask.PickupDeposit) {
            const dep = this._activeDeposit ?? this.deposit;
            this._activeDeposit = null;
            if (dep && dep.stock > 0) {
                EventBus.emit(GameEvent.NPC_REQUEST_PICKUP, {
                    requesterId: this.npcId,
                    resourceType: dep.resourceType,
                    depositId: dep.depositId,
                    worldPos: {
                        x: this.node.worldPosition.x,
                        y: this.node.worldPosition.y,
                        z: 0,
                    },
                });
            }
            this._task = HelperTask.Idle;
            this._state = NpcWorkState.Idle;
            return;
        }
        if (this._task === HelperTask.TradeAtStall && this.stall && this._carrying > 0) {
            const amount = this._carrying;
            this._awaitingDeliver = true;
            EventBus.emit(GameEvent.NPC_REQUEST_DELIVER, {
                requesterId: this.npcId,
                resourceType: this._carryType,
                stallId: this.stall.stallId,
                amount,
            });
            this._carrying = 0;
        }
        this._task = HelperTask.Idle;
        this._state = NpcWorkState.Idle;
    }

    private _onPicked(data: { requesterId: string; type: ResourceType; amount?: number }): void {
        if (data.requesterId !== this.npcId) {
            return;
        }
        this._carrying += data.amount ?? 1;
        this._carryType = data.type;
    }

    private _onDelivered(data: { requesterId?: string; stallId?: string }): void {
        if (data.requesterId && data.requesterId !== this.npcId) {
            return;
        }
        if (data.stallId && this.stall && data.stallId !== this.stall.stallId) {
            return;
        }
        this._awaitingDeliver = false;
    }

    private _moveToward(target: Vec3, dt: number): boolean {
        const cur = this.node.worldPosition;
        const dx = target.x - cur.x;
        const dy = target.y - cur.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 6) {
            this.node.setWorldPosition(target.x, target.y, 0);
            return true;
        }
        const step = this.moveSpeed * dt;
        this.node.setWorldPosition(cur.x + (dx / len) * step, cur.y + (dy / len) * step, 0);
        return false;
    }
}
