import { _decorator, Component, Node, Vec3, Animation } from 'cc';
import { NpcWorkState } from '../core/Enums';
import { EventBus, GameEvent } from '../core/GameEvent';
import { TreeEntity } from '../scene/TreeEntity';

const { ccclass, property } = _decorator;

/**
 * 伐木工：无背负，进入树木范围砍伐并掉落木头（由场景系统发事件）。
 */
@ccclass('LumberjackNpc')
export class LumberjackNpc extends Component {
    @property({ tooltip: 'NPC 唯一 ID' })
    public npcId: string = 'lumberjack_0';

    @property({ tooltip: '移动速度' })
    public moveSpeed: number = 100;

    @property({ tooltip: '砍伐间隔（应 ≥ 树木受击锁定时长）' })
    public chopInterval: number = 1.05;

    @property({ type: [TreeEntity], tooltip: '可砍伐树木列表（也可运行时扫描）' })
    public trees: TreeEntity[] = [];

    @property({ tooltip: '动画组件' })
    public anim: Animation | null = null;

    private _state: NpcWorkState = NpcWorkState.Idle;
    private _target: TreeEntity | null = null;
    private _chopTimer: number = 0;

    protected update(dt: number): void {
        if (!this._target || !this._target.canChop) {
            this._pickTree();
        }
        if (!this._target) {
            this._state = NpcWorkState.Idle;
            return;
        }
        this._state = NpcWorkState.Working;
        const tp = this._target.node.worldPosition;
        const cur = this.node.worldPosition;
        const dx = tp.x - cur.x;
        const dy = tp.y - cur.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 30) {
            const step = this.moveSpeed * dt;
            this.node.setWorldPosition(cur.x + (dx / len) * step, cur.y + (dy / len) * step, 0);
            return;
        }
        this._chopTimer += dt;
        if (this._chopTimer >= this.chopInterval) {
            this._chopTimer = 0;
            if (this.anim) {
                this.anim.play('chop');
            }
            this._target.chop(this.npcId);
        }
    }

    private _pickTree(): void {
        const candidates = this.trees.filter((t) => t && t.isValid && t.canChop);
        if (candidates.length === 0) {
            this._target = null;
            return;
        }
        this._target = candidates[Math.floor(Math.random() * candidates.length)];
    }
}
