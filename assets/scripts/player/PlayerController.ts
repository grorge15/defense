import {
    _decorator,
    Component,
    Node,
    RigidBody2D,
    Vec2,
    Vec3,
    Collider2D,
    Contact2DType,
    IPhysics2DContact,
    ERigidBody2DType,
} from 'cc';
import { PlayerState, ResourceType } from '../core/Enums';
import { EventBus, GameEvent, PlayerStatePayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { VirtualJoystick } from './VirtualJoystick';
import { PlayerCarryStack } from './PlayerCarryStack';
import { ResourceEntity } from '../economy/ResourceEntity';

const { ccclass, property } = _decorator;

/**
 * 玩家控制系统：摇杆 + RigidBody2D 移动。
 * 上塔：踩 GroundPoint（TowerMountTrigger）→ StandPoint 射箭。
 * 下塔：塔上再推摇杆 → 落回 GroundPoint。
 */
@ccclass('PlayerController')
export class PlayerController extends Component {
    @property({ type: VirtualJoystick, tooltip: '虚拟摇杆组件所在节点' })
    public joystick: VirtualJoystick | null = null;

    @property({ type: PlayerCarryStack, tooltip: '背部资源堆叠组件' })
    public carryStack: PlayerCarryStack | null = null;

    @property({ tooltip: '移动速度' })
    public moveSpeed: number = 180;

    @property({ tooltip: '地面近战攻击范围（配置）' })
    public meleeRange: number = GameConstants.PLAYER_MELEE_RANGE;

    @property({ tooltip: '渲染/动画子节点（可选）' })
    public visualNode: Node | null = null;

    private _rb: RigidBody2D | null = null;
    private _state: PlayerState = PlayerState.Ground;
    private _towerMount: Node | null = null;
    /** 下塔后短冷却，避免落在 GroundPoint 上立刻再上塔 */
    private _mountLockUntil: number = 0;
    /** 上塔后须先松摇杆，再推摇杆才下塔，避免走上塔时摇杆仍推着立刻掉下来 */
    private _dismountArmed: boolean = false;

    public get state(): PlayerState {
        return this._state;
    }

    public get worldPos(): Vec3 {
        return this.node.worldPosition.clone();
    }

    /** 供 TowerMountTrigger 判断是否允许本次上塔 */
    public get canMountTower(): boolean {
        return this._state === PlayerState.Ground && Date.now() >= this._mountLockUntil;
    }

    protected onLoad(): void {
        this._rb = this.getComponent(RigidBody2D);
        if (this._rb) {
            this._rb.type = ERigidBody2DType.Dynamic;
            this._rb.gravityScale = 0;
            this._rb.fixedRotation = true;
            this._rb.allowSleep = false;
            this._rb.enabledContactListener = true;
            this._rb.linearDamping = 0;
            this._rb.angularDamping = 0;
        }
        const col = this.getComponent(Collider2D);
        if (col) {
            col.sensor = false;
            col.on(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }
    }

    protected onDestroy(): void {
        const col = this.getComponent(Collider2D);
        if (col) {
            col.off(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }
    }

    protected update(_dt: number): void {
        if (this._state === PlayerState.OnTower) {
            if (this._rb) {
                this._rb.linearVelocity = Vec2.ZERO;
            }
            this._tryRequestDismount();
            this._syncStateEvent();
            return;
        }
        this._applyMove();
        this.requestPickup(ResourceType.RawMeat);
        this.requestPickup(ResourceType.Wood);
        this._syncStateEvent();
    }

    private _tryRequestDismount(): void {
        if (!this.joystick || !this._towerMount) {
            return;
        }
        const d = this.joystick.direction;
        const mag2 = d.x * d.x + d.y * d.y;
        if (mag2 < 0.12 * 0.12) {
            this._dismountArmed = true;
            return;
        }
        if (!this._dismountArmed) {
            return;
        }
        EventBus.emit(GameEvent.REQUEST_DISMOUNT_TOWER, { towerNode: this._towerMount });
    }

    private _applyMove(): void {
        if (!this.joystick || !this._rb || !this._rb.enabled) {
            return;
        }
        const d = this.joystick.direction;
        this._rb.linearVelocity = new Vec2(d.x * this.moveSpeed, d.y * this.moveSpeed);
        const p = this.node.position;
        if (p.z !== 0) {
            this.node.setPosition(p.x, p.y, 0);
        }
    }

    private _syncStateEvent(): void {
        const payload: PlayerStatePayload = {
            state: this._state,
            worldPos: {
                x: this.node.worldPosition.x,
                y: this.node.worldPosition.y,
                z: 0,
            },
        };
        EventBus.emit(GameEvent.PLAYER_STATE_CHANGED, payload);
    }

    private _onBeginContact(_self: Collider2D, other: Collider2D, _contact: IPhysics2DContact | null): void {
        const res = other.getComponent(ResourceEntity) ?? other.node.getComponent(ResourceEntity);
        if (res && !res.flying) {
            this.requestPickup(res.resourceType);
        }
    }

    /** 登上箭塔 StandPoint */
    public mountTower(towerNode: Node, standPos: Vec3): void {
        this._towerMount = towerNode;
        this._state = PlayerState.OnTower;
        this._dismountArmed = false;
        if (this._rb) {
            this._rb.linearVelocity = Vec2.ZERO;
            this._rb.enabled = false;
        }
        this.node.setWorldPosition(standPos.x, standPos.y, 0);
        this._syncStateEvent();
    }

    /** 落回 GroundPoint */
    public dismountTower(groundPos: Vec3): void {
        this._towerMount = null;
        this._state = PlayerState.Ground;
        this._mountLockUntil = Date.now() + 800;
        if (this._rb) {
            this._rb.enabled = true;
            this._rb.linearVelocity = Vec2.ZERO;
        }
        this.node.setWorldPosition(groundPos.x, groundPos.y, 0);
        this._syncStateEvent();
    }

    public requestPickup(resourceType: ResourceType, depositId?: string): void {
        EventBus.emit(GameEvent.REQUEST_PICKUP_RESOURCE, {
            requesterId: 'player',
            resourceType,
            depositId,
            worldPos: {
                x: this.node.worldPosition.x,
                y: this.node.worldPosition.y,
                z: 0,
            },
        });
    }
}
