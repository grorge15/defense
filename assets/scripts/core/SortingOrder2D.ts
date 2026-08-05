import { _decorator, Component, Node, UIRenderer } from 'cc';

const { ccclass, property, executeInEditMode } = _decorator;

/**
 * 伪 3D 透视层级：sortingOrder = -worldY。
 * 挂在美术渲染子节点上；角色可用固定高 priority（如 1000），背负道具用 orderOffset 区分前后。
 */
@ccclass('SortingOrder2D')
@executeInEditMode
export class SortingOrder2D extends Component {
    @property({ tooltip: '额外层级偏移；背负堆叠时 coin/meat/wood 可用 10/9/8 区分前后' })
    public orderOffset: number = 0;

    @property({ tooltip: '是否每帧根据世界 Y 更新层级' })
    public autoUpdate: boolean = true;

    @property({ tooltip: '可选：指定渲染节点（默认取本节点上的 UIRenderer）' })
    public renderNode: Node | null = null;

    private _renderer: UIRenderer | null = null;
    private _fixedPriority: number | null = null;

    protected onLoad(): void {
        const target = this.renderNode ?? this.node;
        this._renderer = target.getComponent(UIRenderer);
    }

    protected update(): void {
        if (!this.autoUpdate) {
            return;
        }
        this.applyOrder();
    }

    /** 立即按世界 Y 刷新排序 */
    public applyOrder(): void {
        if (this._fixedPriority !== null) {
            this._ensureRenderer();
            if (this._renderer) {
                this._renderer.priority = this._fixedPriority;
            }
            return;
        }
        this._ensureRenderer();
        if (!this._renderer) {
            return;
        }
        const worldY = this.node.worldPosition.y;
        this._renderer.priority = Math.round(-worldY) + this.orderOffset;
    }

    /**
     * 道具贴身时调用。
     * @param lowerThanCarrier 为 true 时整体压低，避免盖住角色
     * @param layerBias 同背负下的相对前后（越大越靠前），如金币 > 肉 > 木头
     */
    public setAttachedToCarrier(lowerThanCarrier: boolean = true, layerBias: number = 0): void {
        this._fixedPriority = null;
        this.orderOffset = (lowerThanCarrier ? -1 : 0) + layerBias;
        this.applyOrder();
    }

    /**
     * 背负堆叠专用：固定 priority，不再跟 -worldY（否则堆得越高反而越靠后，且同 Y 时后实例化的类型会盖住先捡的）。
     */
    public setFixedPriority(priority: number): void {
        this.autoUpdate = false;
        this._fixedPriority = Math.round(priority);
        this._ensureRenderer();
        if (this._renderer) {
            this._renderer.priority = this._fixedPriority;
        }
    }

    private _ensureRenderer(): void {
        if (!this._renderer) {
            const target = this.renderNode ?? this.node;
            this._renderer = target.getComponent(UIRenderer);
        }
    }
}
