import { _decorator, Component, Node, Vec3, Animation } from 'cc';
import { HelperTask, NpcWorkState, ResourceType } from '../core/Enums';
import { EventBus, GameEvent } from '../core/GameEvent';
import { playAnimClip } from '../core/AnimPlay';
import { Stall } from '../economy/Stall';
import { DepositPoint } from '../economy/DepositPoint';

const { ccclass, property } = _decorator;

/**
 * 帮手：PlaceRoot 有货或正在上架/烤制时 → 站 InteractZone 售卖；
 * PlaceRoot 耗尽后，仅去本摊位 boundDeposit 取货（Deposit 未开放则不取）。
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

    @property({ type: Animation, tooltip: 'idle / walk 序列帧' })
    public anim: Animation | null = null;

    private _state: NpcWorkState = NpcWorkState.Idle;
    private _task: HelperTask = HelperTask.Idle;
    private _carrying: number = 0;
    private _carryType: ResourceType = ResourceType.RawMeat;
    private _targetPos: Vec3 | null = null;
    private _activeDeposit: DepositPoint | null = null;
    /** 已发出上交请求，等飞行落地（期间不离开交互区去取货） */
    private _awaitingDeliver: boolean = false;
    private _walking: boolean = false;

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
        this._playBodyClip('idle');
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
            this._faceToward(this._targetPos);
            this._setWalking(true);
            if (this._moveToward(this._targetPos, dt)) {
                this._targetPos = null;
                this._setWalking(false);
                this._onArrive();
            }
            return;
        }
        this._setWalking(false);
        this._think();
    }

    private _setWalking(walking: boolean): void {
        if (this._walking === walking) {
            return;
        }
        this._walking = walking;
        this._playBodyClip(walking ? 'walk' : 'idle');
    }

    private _playBodyClip(kind: 'idle' | 'walk'): void {
        if (!this.anim) {
            this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        }
        playAnimClip(this.anim, kind);
    }

    /** 朝移动方向翻转（scale.x） */
    private _faceToward(target: Vec3): void {
        const dx = target.x - this.node.worldPosition.x;
        if (Math.abs(dx) < 1) {
            return;
        }
        const s = this.node.scale;
        const absX = Math.abs(s.x) || 1;
        this.node.setScale(dx < 0 ? -absX : absX, s.y, s.z);
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
        // PlaceRoot 耗尽：仅去本摊位绑定的 Deposit 取货；未开放则不取
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

    /**
     * 只认本摊位 boundDeposit（与 Helper.deposit 对齐）。
     * Deposit 未开放（inactive）或无货 → 不发起取货。
     */
    private _resolvePickupDeposit(): DepositPoint | null {
        const dep = this._boundDeposit();
        if (!dep?.node?.isValid) {
            return null;
        }
        if (!dep.node.activeInHierarchy) {
            return null;
        }
        if (dep.stock <= 0) {
            return null;
        }
        return dep;
    }

    private _boundDeposit(): DepositPoint | null {
        const stallDep = this.stall?.boundDeposit ?? null;
        if (stallDep?.isValid) {
            // 以摊位绑定为准，保持 helper.deposit 同步
            this.deposit = stallDep;
            return stallDep;
        }
        return this.deposit?.isValid ? this.deposit : null;
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
            const dep = this._activeDeposit ?? this._boundDeposit();
            this._activeDeposit = null;
            if (dep?.node?.isValid && dep.node.activeInHierarchy && dep.stock > 0) {
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
