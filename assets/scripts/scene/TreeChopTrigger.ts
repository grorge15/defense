import { _decorator, Component, Vec3 } from 'cc';
import { TreeEntity } from './TreeEntity';
import { PlayerController } from '../player/PlayerController';
import { EventBus, GameEvent, PlayerStatePayload } from '../core/GameEvent';
import { PlayerState } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';

const { ccclass, property } = _decorator;

/**
 * 玩家靠近树木后砍伐（距离判定，不依赖 Collider 接触）。
 * 触发时播 Player_chop，并调用 TreeEntity.chop。
 */
@ccclass('TreeChopTrigger')
export class TreeChopTrigger extends Component {
    @property({ tooltip: '关联树木（空则本节点 / 父节点 TreeEntity）' })
    public tree: TreeEntity | null = null;

    @property({ tooltip: '玩家砍伐间隔（应 ≥ 树木受击锁定时长）' })
    public chopInterval: number = 1.05;

    @property({ tooltip: '砍伐触发距离（世界单位）' })
    public chopRange: number = GameConstants.TREE_CHOP_RANGE;

    private _timer: number = 0;
    private _playerPos = new Vec3();
    private _playerOnGround: boolean = true;
    private _player: PlayerController | null = null;

    protected onLoad(): void {
        if (!this.tree) {
            this.tree =
                this.getComponent(TreeEntity) ??
                this.node.parent?.getComponent(TreeEntity) ??
                null;
        }
        EventBus.on(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
    }

    protected start(): void {
        this._resolvePlayer();
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
    }

    protected update(dt: number): void {
        if (!this.tree?.canChop || !this._playerOnGround) {
            return;
        }
        if (!this._player?.isValid) {
            this._resolvePlayer();
        }
        const px = this._playerPos.x;
        const py = this._playerPos.y;
        const tp = this.tree.node.worldPosition;
        const dx = px - tp.x;
        const dy = py - tp.y;
        const r = this.chopRange;
        if (dx * dx + dy * dy > r * r) {
            this._timer = 0;
            return;
        }
        this._timer += dt;
        if (this._timer < this.chopInterval) {
            return;
        }
        this._timer = 0;
        this._player?.playChop();
        this.tree.chop('player');
    }

    private _onPlayerState(data: PlayerStatePayload): void {
        this._playerPos.set(data.worldPos.x, data.worldPos.y, 0);
        this._playerOnGround = data.state === PlayerState.Ground;
    }

    private _resolvePlayer(): void {
        this._player =
            this.node.scene?.getComponentInChildren(PlayerController) ?? null;
        if (this._player) {
            const wp = this._player.worldPos;
            this._playerPos.set(wp.x, wp.y, 0);
            this._playerOnGround = this._player.state === PlayerState.Ground;
        }
    }
}
