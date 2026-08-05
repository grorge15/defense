import { _decorator, Component, Animation, Collider2D, Node } from 'cc';
import { EventBus, GameEvent, PlayerStatePayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { Wall } from './Wall';

const { ccclass, property } = _decorator;

/**
 * 城门：靠近开门、离开关门。
 * 开门时关闭门道刚体阻挡（含门自身与邻近城墙碰撞），保证玩家用 RigidBody 可通行。
 */
@ccclass('Gate')
export class Gate extends Component {
    @property({ tooltip: '开门距离' })
    public openDistance: number = GameConstants.GATE_OPEN_DISTANCE;

    @property({ tooltip: '关门距离（应大于开门距离）' })
    public closeDistance: number = GameConstants.GATE_OPEN_DISTANCE + 40;

    @property({ tooltip: '开门时额外放开周围城墙碰撞的半径' })
    public clearWallRadius: number = 90;

    @property({ type: Animation, tooltip: '门动画组件（可空）' })
    public anim: Animation | null = null;

    @property({ tooltip: '开门动画名' })
    public openAnim: string = 'open';

    @property({ tooltip: '关门动画名' })
    public closeAnim: string = 'close';

    @property({ type: [Collider2D], tooltip: '门道阻挡碰撞列表（可空，运行时自动收集）' })
    public doorBlockers: Collider2D[] = [];

    private _open: boolean = false;
    private _playerPos = { x: 0, y: 0 };
    private _blockers: Collider2D[] = [];

    protected onLoad(): void {
        if (!this.anim) {
            this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        }
        this._collectBlockers();
        // 初始关门：阻挡开启
        this._setBlockersEnabled(true);
        EventBus.on(GameEvent.PLAYER_STATE_CHANGED, this._onPlayer, this);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.PLAYER_STATE_CHANGED, this._onPlayer, this);
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
        // 开门：关闭阻挡；关门：恢复阻挡
        this._setBlockersEnabled(!shouldOpen);
        if (!this.anim) {
            return;
        }
        const name = shouldOpen ? this.openAnim : this.closeAnim;
        if (this.anim.getState(name) || this.anim.clips.length > 0) {
            this.anim.play(name);
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
        } else {
            const selfCols = this.getComponents(Collider2D);
            for (const c of selfCols) {
                c.sensor = false;
                this._blockers.push(c);
            }
            // 邻近城墙碰撞一并纳入门道通行控制
            const walls = this.node.scene?.getComponentsInChildren(Wall) ?? [];
            const gp = this.node.worldPosition;
            const r2 = this.clearWallRadius * this.clearWallRadius;
            for (const wall of walls) {
                const wp = wall.node.worldPosition;
                const ddx = wp.x - gp.x;
                const ddy = wp.y - gp.y;
                if (ddx * ddx + ddy * ddy > r2) {
                    continue;
                }
                const cols = wall.getComponents(Collider2D);
                for (const c of cols) {
                    if (c && !c.sensor) {
                        this._blockers.push(c);
                    }
                }
            }
        }
    }

    private _setBlockersEnabled(enabled: boolean): void {
        for (const c of this._blockers) {
            if (c && c.isValid) {
                c.enabled = enabled;
            }
        }
    }

    private _onPlayer(data: PlayerStatePayload): void {
        this._playerPos.x = data.worldPos.x;
        this._playerPos.y = data.worldPos.y;
    }
}
