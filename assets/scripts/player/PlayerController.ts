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
    Animation,
    Sprite,
    tween,
    Tween,
} from 'cc';
import { PlayerState, ResourceType } from '../core/Enums';
import { EventBus, GameEvent, PlayerStatePayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { playAnimClip } from '../core/AnimPlay';
import { VirtualJoystick } from './VirtualJoystick';
import { PlayerCarryStack } from './PlayerCarryStack';
import { ResourceEntity } from '../economy/ResourceEntity';

const { ccclass, property } = _decorator;

type LocoClip = 'idle' | 'run';
type ActionClip = 'meleeAttack' | 'rangeAttack' | 'chop' | 'dead';

/**
 * 玩家控制系统：摇杆 + RigidBody2D 移动。
 * 上塔：踩 GroundPoint（TowerMountTrigger）→ StandPoint 射箭（程序位移）。
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

    @property({ type: Animation, tooltip: 'idle/run/meleeAttack/rangeAttack/dead/chop' })
    public anim: Animation | null = null;

    @property({ tooltip: '跳上箭塔时长（秒）' })
    public jumpToTowerDuration: number = 0.28;

    private _rb: RigidBody2D | null = null;
    private _state: PlayerState = PlayerState.Ground;
    private _towerMount: Node | null = null;
    /** 下塔后短冷却，避免落在 GroundPoint 上立刻再上塔 */
    private _mountLockUntil: number = 0;
    /** 上塔后须先松摇杆，再推摇杆才下塔，避免走上塔时摇杆仍推着立刻掉下来 */
    private _dismountArmed: boolean = false;
    private _loco: LocoClip = 'idle';
    private _action: ActionClip | null = null;
    private _jumping: boolean = false;
    /** true = 朝左；默认朝右 */
    private _facingLeft: boolean = false;
    private _bodySprite: Sprite | null = null;
    private _carryRoot: Node | null = null;
    private _carryBaseX: number = 0;

    public get state(): PlayerState {
        return this._state;
    }

    public get worldPos(): Vec3 {
        return this.node.worldPosition.clone();
    }

    /** 供 TowerMountTrigger 判断是否允许本次上塔 */
    public get canMountTower(): boolean {
        return (
            this._state === PlayerState.Ground &&
            !this._jumping &&
            Date.now() >= this._mountLockUntil
        );
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
        if (!this.anim) {
            this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        }
        this._resolveFacingTargets();
        this._setFacingLeft(false);
        this._playClip('idle');
    }

    protected start(): void {
        // Animation 可能在本组件之后才建 State；start 再播一次保证非 default 也能切
        this._loco = 'idle';
        this._playClip('idle');
    }

    protected onDestroy(): void {
        const col = this.getComponent(Collider2D);
        if (col) {
            col.off(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }
        Tween.stopAllByTarget(this.node);
    }

    protected update(_dt: number): void {
        if (this._jumping) {
            this._syncStateEvent();
            return;
        }
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
            this._setLoco('idle');
            return;
        }
        const d = this.joystick.direction;
        this._rb.linearVelocity = new Vec2(d.x * this.moveSpeed, d.y * this.moveSpeed);
        const p = this.node.position;
        if (p.z !== 0) {
            this.node.setPosition(p.x, p.y, 0);
        }
        if (d.x < -0.01) {
            this._setFacingLeft(true);
        } else if (d.x > 0.01) {
            this._setFacingLeft(false);
        }
        const moving = d.x * d.x + d.y * d.y > 0.01;
        this._setLoco(moving ? 'run' : 'idle');
    }

    private _resolveFacingTargets(): void {
        const visual =
            this.visualNode ?? this.node.getChildByName('frame_00000') ?? this.node;
        this._bodySprite = visual.getComponent(Sprite) ?? visual.getComponentInChildren(Sprite);

        this._carryRoot =
            this.carryStack?.carryRoot ??
            this.node.getChildByName('CarryRoot') ??
            null;
        if (this._carryRoot) {
            this._carryBaseX = this._carryRoot.position.x;
        }
    }

    private _setFacingLeft(left: boolean): void {
        if (!this._bodySprite || !this._carryRoot) {
            this._resolveFacingTargets();
        }
        if (this._facingLeft === left && this._bodySprite?.flipX === left) {
            return;
        }
        this._facingLeft = left;

        // RigidBody2D 会锁根节点旋转，改用 Sprite.flipX
        if (this._bodySprite) {
            this._bodySprite.flipX = left;
        }

        // 背负随朝向镜像：scale.x + 本地 X 翻到另一侧（保持在角色背后）
        if (this._carryRoot?.isValid) {
            const s = this._carryRoot.scale;
            const sx = Math.abs(s.x) || 1;
            this._carryRoot.setScale(left ? -sx : sx, s.y, s.z);
            const p = this._carryRoot.position;
            this._carryRoot.setPosition(left ? -this._carryBaseX : this._carryBaseX, p.y, p.z);
        }
    }

    private _setLoco(kind: LocoClip): void {
        if (this._action) {
            return;
        }
        if (this._loco === kind) {
            return;
        }
        this._loco = kind;
        this._playClip(kind);
    }

    /** 地面近战 */
    public playMeleeAttack(): void {
        this._playAction('meleeAttack');
    }

    /** 箭塔远程射箭 */
    public playRangeAttack(): void {
        this._playAction('rangeAttack');
    }

    /** 砍树 */
    public playChop(): void {
        this._playAction('chop');
    }

    /** 死亡（若接入生命系统时调用） */
    public playDead(): void {
        this._playAction('dead', true);
    }

    private _playAction(kind: ActionClip, hold = false): void {
        this._action = kind;
        const state = (() => {
            if (!this.anim) {
                this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
            }
            return playAnimClip(this.anim, kind, { restart: true });
        })();
        if (hold) {
            return;
        }
        const clip = state?.clip;
        const dur = clip ? Math.max(clip.duration / Math.max(clip.speed, 0.01), 0.05) : 0.25;
        this.unschedule(this._clearAction);
        this.scheduleOnce(this._clearAction, dur);
    }

    private _clearAction = (): void => {
        this._action = null;
        this._loco = 'idle';
        this._playClip(this._state === PlayerState.OnTower ? 'idle' : this._loco);
    };

    private _playClip(name: string): void {
        if (!this.anim) {
            this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        }
        playAnimClip(this.anim, name);
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

    /** 登上箭塔 StandPoint（程序位移 jumpToTower） */
    public mountTower(towerNode: Node, standPos: Vec3): void {
        this._towerMount = towerNode;
        this._dismountArmed = false;
        if (this._rb) {
            this._rb.linearVelocity = Vec2.ZERO;
            this._rb.enabled = false;
        }
        this._jumpTo(standPos, () => {
            this._state = PlayerState.OnTower;
            this._syncStateEvent();
        });
    }

    /** 落回 GroundPoint */
    public dismountTower(groundPos: Vec3): void {
        this._towerMount = null;
        this._mountLockUntil = Date.now() + 800;
        this._jumpTo(groundPos, () => {
            this._state = PlayerState.Ground;
            if (this._rb) {
                this._rb.enabled = true;
                this._rb.linearVelocity = Vec2.ZERO;
            }
            this._syncStateEvent();
        });
    }

    /** 程序控制向目标点跳跃（无序列帧） */
    private _jumpTo(target: Vec3, onDone: () => void): void {
        this._jumping = true;
        this._action = null;
        this.unschedule(this._clearAction);
        Tween.stopAllByTarget(this.node);
        const from = this.node.worldPosition.clone();
        const mid = new Vec3((from.x + target.x) * 0.5, Math.max(from.y, target.y) + 40, 0);
        const dur = Math.max(this.jumpToTowerDuration, 0.05);
        const progress = { k: 0 };
        Tween.stopAllByTarget(progress);
        tween(progress)
            .to(
                dur * 0.5,
                { k: 1 },
                {
                    easing: 'sineOut',
                    onUpdate: () => {
                        const k = progress.k;
                        this.node.setWorldPosition(
                            from.x + (mid.x - from.x) * k,
                            from.y + (mid.y - from.y) * k,
                            0,
                        );
                    },
                },
            )
            .call(() => {
                progress.k = 0;
            })
            .to(
                dur * 0.5,
                { k: 1 },
                {
                    easing: 'sineIn',
                    onUpdate: () => {
                        const k = progress.k;
                        this.node.setWorldPosition(
                            mid.x + (target.x - mid.x) * k,
                            mid.y + (target.y - mid.y) * k,
                            0,
                        );
                    },
                },
            )
            .call(() => {
                this.node.setWorldPosition(target.x, target.y, 0);
                this._jumping = false;
                this._loco = 'idle';
                this._playClip('idle');
                onDone();
            })
            .start();
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
