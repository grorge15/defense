import { _decorator, Component, Node, Vec3 } from 'cc';
import { PlayerController } from './PlayerController';

const { ccclass, property } = _decorator;

/**
 * 主相机跟随玩家（XY），Z 轴保持相机初始高度。
 * 挂到 MainCamera；target 空则自动找 GameRoot/Player。
 */
@ccclass('CameraFollow')
export class CameraFollow extends Component {
    @property({ type: Node, tooltip: '跟随目标（Player 节点）' })
    public target: Node | null = null;

    @property({ tooltip: '相对目标的世界坐标偏移' })
    public offset: Vec3 = new Vec3(0, 0, 0);

    @property({ tooltip: '平滑时间（秒）；0 = 立刻跟随' })
    public smoothTime: number = 0.1;

    private _camZ: number = 0;
    private _tmp = new Vec3();

    protected onLoad(): void {
        this._camZ = this.node.worldPosition.z;
        this._resolveTarget();
    }

    protected lateUpdate(dt: number): void {
        if (!this.target?.isValid) {
            this._resolveTarget();
        }
        if (!this.target?.isValid) {
            return;
        }

        const tw = this.target.worldPosition;
        const wantX = tw.x + this.offset.x;
        const wantY = tw.y + this.offset.y;

        if (this.smoothTime <= 0) {
            this.node.setWorldPosition(wantX, wantY, this._camZ);
            return;
        }

        const cur = this.node.worldPosition;
        const k = Math.min(1, dt / Math.max(0.01, this.smoothTime));
        this._tmp.set(
            cur.x + (wantX - cur.x) * k,
            cur.y + (wantY - cur.y) * k,
            this._camZ,
        );
        this.node.setWorldPosition(this._tmp);
    }

    private _resolveTarget(): void {
        if (this.target?.isValid) {
            return;
        }
        const scene = this.node.scene;
        if (!scene) {
            return;
        }
        const gameRoot = scene.getChildByName('GameRoot');
        this.target =
            gameRoot?.getChildByName('Player') ??
            scene.getComponentInChildren(PlayerController)?.node ??
            null;
    }
}
