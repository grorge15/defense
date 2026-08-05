import { _decorator, Component, Collider2D, Contact2DType } from 'cc';
import { TreeEntity } from './TreeEntity';

const { ccclass, property } = _decorator;

/** 玩家进入树木触发区后开始砍伐 */
@ccclass('TreeChopTrigger')
export class TreeChopTrigger extends Component {
    @property({ tooltip: '关联树木' })
    public tree: TreeEntity | null = null;

    @property({ tooltip: '玩家砍伐间隔（应 ≥ 树木受击锁定时长）' })
    public chopInterval: number = 1.05;

    private _playerIn: boolean = false;
    private _timer: number = 0;

    protected onLoad(): void {
        if (!this.tree) {
            this.tree = this.getComponent(TreeEntity) ?? this.node.parent?.getComponent(TreeEntity) ?? null;
        }
        const col = this.getComponent(Collider2D);
        if (col) {
            col.on(Contact2DType.BEGIN_CONTACT, this._onEnter, this);
            col.on(Contact2DType.END_CONTACT, this._onExit, this);
        }
    }

    protected onDestroy(): void {
        const col = this.getComponent(Collider2D);
        if (col) {
            col.off(Contact2DType.BEGIN_CONTACT, this._onEnter, this);
            col.off(Contact2DType.END_CONTACT, this._onExit, this);
        }
    }

    protected update(dt: number): void {
        if (!this._playerIn || !this.tree?.canChop) {
            return;
        }
        this._timer += dt;
        if (this._timer >= this.chopInterval) {
            this._timer = 0;
            this.tree.chop('player');
        }
    }

    private _onEnter(_s: Collider2D, other: Collider2D): void {
        if (other.node.getComponent('PlayerController') || other.node.name.indexOf('Player') >= 0) {
            this._playerIn = true;
        }
    }

    private _onExit(_s: Collider2D, other: Collider2D): void {
        if (other.node.getComponent('PlayerController') || other.node.name.indexOf('Player') >= 0) {
            this._playerIn = false;
            this._timer = 0;
        }
    }
}
