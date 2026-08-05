import { _decorator, Component, Node, UIRenderer } from 'cc';

const { ccclass, property, executeInEditMode } = _decorator;

/**
 * 伪 3D 透视层级：sortingOrder = -worldY。
 * 挂在美术渲染子节点上；道具飞到角色身上后，层级需低于角色。
 */
@ccclass('SortingOrder2D')
@executeInEditMode
export class SortingOrder2D extends Component {
    @property({ tooltip: '额外层级偏移，飞到角色身上的道具可设为负数以保证低于角色' })
    public orderOffset: number = 0;

    @property({ tooltip: '是否每帧根据世界 Y 更新层级' })
    public autoUpdate: boolean = true;

    @property({ tooltip: '可选：指定渲染节点（默认取本节点上的 UIRenderer）' })
    public renderNode: Node | null = null;

    private _renderer: UIRenderer | null = null;

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
        if (!this._renderer) {
            const target = this.renderNode ?? this.node;
            this._renderer = target.getComponent(UIRenderer);
        }
        if (!this._renderer) {
            return;
        }
        const worldY = this.node.worldPosition.y;
        this._renderer.priority = Math.round(-worldY) + this.orderOffset;
    }

    /** 道具贴身时调用，强制压低层级 */
    public setAttachedToCarrier(lowerThanCarrier: boolean = true): void {
        this.orderOffset = lowerThanCarrier ? -1 : 0;
        this.applyOrder();
    }
}
