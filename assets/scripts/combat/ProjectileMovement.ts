import { _decorator, Animation, Component, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 弹丸直线飞行：播放序列帧动画，抵达目标后回调并销毁节点。
 */
@ccclass('ProjectileMovement')
export class ProjectileMovement extends Component {
    @property({ tooltip: '飞行时长（秒）' })
    public flyDuration: number = 0.35;

    private _flying = false;
    private _elapsed = 0;
    private readonly _start = new Vec3();
    private readonly _dest = new Vec3();
    private _onHit: (() => void) | null = null;

    public launchTo(dest: Vec3, duration?: number, onHit?: () => void): void {
        this._start.set(this.node.worldPosition);
        this._dest.set(dest.x, dest.y, 0);
        this._elapsed = 0;
        this._flying = true;
        if (duration !== undefined) {
            this.flyDuration = duration;
        }
        this._onHit = onHit ?? null;

        const anim = this.node.getComponent(Animation) ?? this.node.getComponentInChildren(Animation);
        if (anim) {
            anim.play();
        }
    }

    protected update(dt: number): void {
        if (!this._flying) {
            return;
        }
        this._elapsed += dt;
        const k = Math.min(1, this._elapsed / this.flyDuration);
        this.node.setWorldPosition(
            this._start.x + (this._dest.x - this._start.x) * k,
            this._start.y + (this._dest.y - this._start.y) * k,
            0,
        );
        if (k >= 1) {
            this._flying = false;
            this._onHit?.();
            if (this.node.isValid) {
                this.node.destroy();
            }
        }
    }
}
