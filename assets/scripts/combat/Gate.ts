import {
    _decorator,
    Component,
    Animation,
    Collider2D,
    Contact2DType,
    IPhysics2DContact,
    RigidBody2D,
} from 'cc';
import { EventBus, GameEvent, PlayerStatePayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { PlayerController } from '../player/PlayerController';
import { playAnimClip } from '../core/AnimPlay';

const { ccclass, property } = _decorator;

/**
 * 城门：靠近开门、离开关门。
 * 碰撞体始终开启（继续挡住 enemy）；开门时在 PRE_SOLVE 对玩家禁用接触，避免敌人跟着进城。
 */
@ccclass('Gate')
export class Gate extends Component {
    @property({ tooltip: '开门距离' })
    public openDistance: number = GameConstants.GATE_OPEN_DISTANCE;

    @property({ tooltip: '关门距离（应大于开门距离）' })
    public closeDistance: number = GameConstants.GATE_CLOSE_DISTANCE;

    @property({ type: Animation, tooltip: '门动画组件（可空）' })
    public anim: Animation | null = null;

    @property({ tooltip: '开门动画名' })
    public openAnim: string = 'open';

    @property({ tooltip: '关门动画名' })
    public closeAnim: string = 'close';

    @property({ type: [Collider2D], tooltip: '门道阻挡碰撞（空则用本节点及子节点 Collider2D）' })
    public doorBlockers: Collider2D[] = [];

    private _open: boolean = false;
    private _playerPos = { x: 0, y: 0 };
    private _blockers: Collider2D[] = [];

    protected onLoad(): void {
        // 旧 prefab/场景常序列化 120/160，运行时对齐到更近的默认值
        if (this.openDistance > GameConstants.GATE_OPEN_DISTANCE) {
            this.openDistance = GameConstants.GATE_OPEN_DISTANCE;
        }
        if (this.closeDistance > GameConstants.GATE_CLOSE_DISTANCE) {
            this.closeDistance = Math.max(
                this.openDistance + 20,
                GameConstants.GATE_CLOSE_DISTANCE,
            );
        }
        if (!this.anim) {
            this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        }
        // 必须开接触回调，否则无法对玩家放行
        const rbs = this.getComponentsInChildren(RigidBody2D);
        for (const rb of rbs) {
            rb.enabledContactListener = true;
        }
        this._collectBlockers();
        for (const c of this._blockers) {
            c.sensor = false;
            c.enabled = true;
            // BEGIN：新接触立刻放行；PRE_SOLVE：已顶着门再开门时每帧放行
            c.on(Contact2DType.BEGIN_CONTACT, this._onPlayerContact, this);
            c.on(Contact2DType.PRE_SOLVE, this._onPlayerContact, this);
        }
        EventBus.on(GameEvent.PLAYER_STATE_CHANGED, this._onPlayer, this);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.PLAYER_STATE_CHANGED, this._onPlayer, this);
        for (const c of this._blockers) {
            if (c?.isValid) {
                c.off(Contact2DType.BEGIN_CONTACT, this._onPlayerContact, this);
                c.off(Contact2DType.PRE_SOLVE, this._onPlayerContact, this);
            }
        }
    }

    protected update(): void {
        const wp = this.node.worldPosition;
        const dx = this._playerPos.x - wp.x;
        const dy = this._playerPos.y - wp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let shouldOpen = this._open;
        if (this._open) {
            shouldOpen = dist <= this.closeDistance;
        } else {
            shouldOpen = dist <= this.openDistance;
        }
        if (shouldOpen === this._open) {
            return;
        }
        this._open = shouldOpen;
        playAnimClip(this.anim, shouldOpen ? this.openAnim : this.closeAnim, { restart: true });
        // 开门瞬间唤醒刚体，确保立刻进入 PRE_SOLVE
        if (shouldOpen) {
            for (const c of this._blockers) {
                const rb = c.body ?? c.node.getComponent(RigidBody2D);
                rb?.wakeUp?.();
            }
        }
    }

    private _collectBlockers(): void {
        this._blockers.length = 0;
        if (this.doorBlockers && this.doorBlockers.length > 0) {
            for (const c of this.doorBlockers) {
                if (c) {
                    this._blockers.push(c);
                }
            }
            return;
        }
        const cols = this.getComponentsInChildren(Collider2D);
        for (const c of cols) {
            this._blockers.push(c);
        }
    }

    /**
     * 开门时：与玩家的接触忽略物理阻挡；敌人仍被挡住。
     * 必须挂 PRE_SOLVE：玩家先顶门再开门时 BEGIN 不会再触发。
     */
    private _onPlayerContact(
        _self: Collider2D,
        other: Collider2D,
        contact: IPhysics2DContact | null,
    ): void {
        if (!this._open || !contact) {
            return;
        }
        if (this._isPlayerCollider(other)) {
            contact.disabled = true;
        }
    }

    private _isPlayerCollider(col: Collider2D): boolean {
        const n = col.node;
        return !!(
            n.getComponent(PlayerController) ||
            n.getComponentInChildren(PlayerController) ||
            n.parent?.getComponent(PlayerController)
        );
    }

    private _onPlayer(data: PlayerStatePayload): void {
        this._playerPos.x = data.worldPos.x;
        this._playerPos.y = data.worldPos.y;
    }
}
