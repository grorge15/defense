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
    tween,
    Tween,
} from 'cc';
import { PlayerState, ResourceType } from '../core/Enums';
import { EventBus, GameEvent, PlayerStatePayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { playAnimClip, resolveAnimState } from '../core/AnimPlay';
import { SortingOrder2D } from '../core/SortingOrder2D';
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

    @property({ tooltip: '在塔上时 SortingOrder2D.orderOffset 额外增加值' })
    public towerSortOffset: number = 100;

    private _rb: RigidBody2D | null = null;
    private _colliders: Collider2D[] = [];
    private _state: PlayerState = PlayerState.Ground;
    private _towerMount: Node | null = null;
    /** 下塔后短冷却，避免落在 GroundPoint 上立刻再上塔 */
    private _mountLockUntil: number = 0;
    /** 上塔后须先松摇杆，再推摇杆才下塔，避免走上塔时摇杆仍推着立刻掉下来 */
    private _dismountArmed: boolean = false;
    private _loco: LocoClip = 'idle';
    private _action: ActionClip | null = null;
    private _jumping: boolean = false;
    /** true = 朝左（Y=180）；默认朝右 */
    private _facingLeft: boolean = false;
    private _towerSortBoosted: boolean = false;
    private _savedSortOffsets = new Map<SortingOrder2D, number>();
    /** 通关后锁定移动 */
    private _inputLocked: boolean = false;

    public get state(): PlayerState {
        return this._state;
    }

    public get worldPos(): Vec3 {
        return this.node.worldPosition.clone();
    }

    /** 锁定/解锁玩家移动与摇杆 */
    public setInputLocked(locked: boolean): void {
        this._inputLocked = locked;
        this.joystick?.setInputLocked(locked);
        if (locked && this._rb) {
            this._rb.linearVelocity = Vec2.ZERO;
            this._setLoco('idle');
        }
    }

    public get inputLocked(): boolean {
        return this._inputLocked;
    }

    /** 供 TowerMountTrigger 判断是否允许本次上塔 */
    public get canMountTower(): boolean {
        return (
            this._state === PlayerState.Ground &&
            !this._jumping &&
            Date.now() >= this._mountLockUntil
        );
    }

    /** 是否正在播放攻击/砍树/死亡等动作 clip */
    public get isActionBusy(): boolean {
        return this._action !== null;
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
        const cols = this.getComponents(Collider2D);
        this._colliders = cols.slice();
        for (const col of cols) {
            col.sensor = false;
            col.on(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }
        if (!this.anim) {
            this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        }
        this._setFacingLeft(false);
        this._playClip('idle');
    }

    protected start(): void {
        // Animation 可能在本组件之后才建 State；start 再播一次保证非 default 也能切
        this._loco = 'idle';
        this._playClip('idle');
    }

    protected onDestroy(): void {
        for (const col of this._colliders) {
            if (col?.isValid) {
                col.off(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
            }
        }
        Tween.stopAllByTarget(this.node);
    }

    protected update(_dt: number): void {
        if (this._inputLocked) {
            if (this._rb) {
                this._rb.linearVelocity = Vec2.ZERO;
            }
            this._setLoco('idle');
            this._syncStateEvent();
            return;
        }
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
        this.requestPickup(ResourceType.Coin);
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

    private _setFacingLeft(left: boolean): void {
        if (this._facingLeft === left) {
            return;
        }
        this._facingLeft = left;
        // RigidBody2D 会同步根节点角度，Y 旋转无效；用 scale.x 翻转整棵子树
        // （frame 动画 + CarryRoot 背负一并朝向）
        const s = this.node.scale;
        this.node.setScale(left ? -Math.abs(s.x) || -1 : Math.abs(s.x) || 1, s.y, s.z);
        // 清掉可能残留的 Y 旋转，避免与 scale 叠加
        this.node.setRotationFromEuler(0, 0, 0);
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

    /** 地面近战（资源 clip 名为 rangeAttack / Player_rangeAttack） */
    public playMeleeAttack(): void {
        this._playAction('rangeAttack');
    }

    /** 箭塔远程射箭（资源 clip 名为 meleeAttack） */
    public playRangeAttack(): void {
        this._playAction('meleeAttack');
    }

    /** 近战 clip 帧事件（资源名 rangeAttack）→ 圆形范围伤害 */
    public onRangeHit(): void {
        EventBus.emit(GameEvent.PLAYER_MELEE_HIT);
    }

    /** 射箭 clip 帧事件（资源名 meleeAttack）→ 远程伤害结算 */
    public onMeleeHit(): void {
        EventBus.emit(GameEvent.PLAYER_RANGE_HIT);
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
        if (this._action === kind) {
            if (!this.anim) {
                this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
            }
            const playing = resolveAnimState(this.anim, kind);
            if (playing?.isPlaying) {
                return;
            }
        }
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
        const ended = this._action;
        this._action = null;
        this._loco = 'idle';
        this._playClip(this._state === PlayerState.OnTower ? 'idle' : this._loco);
        if (ended) {
            EventBus.emit(GameEvent.PLAYER_ACTION_FINISHED, { clip: ended });
        }
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
        this._setCollidersEnabled(false);
        this._jumpTo(standPos, () => {
            this._state = PlayerState.OnTower;
            this._setTowerSortBoost(true);
            this._syncStateEvent();
        });
    }

    /** 落回 GroundPoint */
    public dismountTower(groundPos: Vec3): void {
        this._towerMount = null;
        this._mountLockUntil = Date.now() + 800;
        this._jumpTo(groundPos, () => {
            this._state = PlayerState.Ground;
            this._setTowerSortBoost(false);
            if (this._rb) {
                this._rb.enabled = true;
                this._rb.linearVelocity = Vec2.ZERO;
            }
            this._setCollidersEnabled(true);
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

    /** 上塔关闭碰撞，下塔还原 */
    private _setCollidersEnabled(on: boolean): void {
        if (this._colliders.length === 0) {
            this._colliders = this.getComponents(Collider2D);
        }
        for (const col of this._colliders) {
            if (col?.isValid) {
                col.enabled = on;
            }
        }
    }

    /** 上塔 +offset，下塔还原 SortingOrder2D.orderOffset */
    private _setTowerSortBoost(on: boolean): void {
        if (on === this._towerSortBoosted) {
            return;
        }
        const boost = this.towerSortOffset;
        const sorts = this.node.getComponentsInChildren(SortingOrder2D);
        if (on) {
            for (const s of sorts) {
                if (!s?.isValid) {
                    continue;
                }
                if (!this._savedSortOffsets.has(s)) {
                    this._savedSortOffsets.set(s, s.orderOffset);
                }
                s.orderOffset += boost;
                s.applyOrder();
            }
            this._towerSortBoosted = true;
            return;
        }
        for (const s of sorts) {
            if (!s?.isValid) {
                continue;
            }
            const base = this._savedSortOffsets.get(s);
            if (base !== undefined) {
                s.orderOffset = base;
                s.applyOrder();
            }
        }
        this._savedSortOffsets.clear();
        this._towerSortBoosted = false;
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
