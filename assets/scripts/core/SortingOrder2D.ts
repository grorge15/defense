import { _decorator, Component, Node, Sorting2D, UIRenderer } from 'cc';

const { ccclass, property, executeInEditMode, menu } = _decorator;

const SORT_MIN = -32768;
const SORT_MAX = 32767;

/**
 * 伪 3D 透视层级驱动：按 -worldY 写入引擎自带 Sorting2D.sortingOrder。
 *
 * 挂上本脚本时会自动在同节点（及带 Sprite 的子节点）补上 `cc.Sorting2D`。
 * Sorting2D 要求节点已有 Sprite/Label（UIRenderer），不会添加 UIRenderer。
 */
@ccclass('SortingOrder2D')
@menu('2D/SortingOrder2D')
@executeInEditMode
export class SortingOrder2D extends Component {
    @property({ tooltip: '额外层级偏移；背负堆叠时 coin/meat/wood 可用 10/9/8 区分前后' })
    public orderOffset: number = 0;

    @property({ tooltip: '是否每帧根据世界 Y 更新层级' })
    public autoUpdate: boolean = true;

    @property({
        type: Node,
        tooltip: '可选：指定主渲染节点（默认本节点）；须已有 Sprite/Label',
    })
    public renderNode: Node | null = null;

    @property({
        tooltip: '是否给带 Sprite/Label 的子节点也自动挂 Sorting2D 并同步 sortingOrder',
    })
    public includeChildren: boolean = true;

    private _fixedOrder: number | null = null;

    /** 确保节点上有 SortingOrder2D，并顺带挂上引擎 Sorting2D */
    public static ensure(node: Node, orderOffset: number = 0): SortingOrder2D {
        let sort = node.getComponent(SortingOrder2D);
        if (!sort) {
            sort = node.addComponent(SortingOrder2D);
        }
        sort.orderOffset = orderOffset;
        sort.autoUpdate = true;
        sort.applyOrder();
        return sort;
    }

    protected onLoad(): void {
        this._ensureBuiltInSorting();
        this.applyOrder();
    }

    protected onEnable(): void {
        this._ensureBuiltInSorting();
        this.applyOrder();
    }

    protected update(): void {
        if (!this.autoUpdate) {
            return;
        }
        this.applyOrder();
    }

    /** 立即按世界 Y（或固定值）刷新 Sorting2D.sortingOrder */
    public applyOrder(): void {
        this._ensureBuiltInSorting();
        const order =
            this._fixedOrder !== null
                ? this._fixedOrder
                : Math.round(-this.node.worldPosition.y) + this.orderOffset;
        this._applySortingOrder(this._clampOrder(order));
    }

    /**
     * 道具贴身时调用。
     * @param lowerThanCarrier 为 true 时整体压低，避免盖住角色
     * @param layerBias 同背负下的相对前后（越大越靠前），如金币 > 肉 > 木头
     */
    public setAttachedToCarrier(lowerThanCarrier: boolean = true, layerBias: number = 0): void {
        this._fixedOrder = null;
        this.orderOffset = (lowerThanCarrier ? -1 : 0) + layerBias;
        this.applyOrder();
    }

    /**
     * 背负堆叠专用：固定 sortingOrder，不再跟 -worldY。
     */
    public setFixedPriority(priority: number): void {
        this.autoUpdate = false;
        this._fixedOrder = Math.round(priority);
        this.applyOrder();
    }

    /** 在带 UIRenderer 的节点上补引擎 Sorting2D（不补 UIRenderer） */
    private _ensureBuiltInSorting(): void {
        const roots: Node[] = [this.renderNode ?? this.node];
        if (this.includeChildren) {
            for (const r of this.node.getComponentsInChildren(UIRenderer)) {
                if (r.node && roots.indexOf(r.node) < 0) {
                    roots.push(r.node);
                }
            }
        }
        for (const n of roots) {
            if (!n.getComponent(UIRenderer)) {
                continue;
            }
            if (!n.getComponent(Sorting2D)) {
                n.addComponent(Sorting2D);
            }
        }
    }

    private _applySortingOrder(order: number): void {
        if (this.includeChildren) {
            const list = this.node.getComponentsInChildren(Sorting2D);
            if (list.length > 0) {
                for (const s of list) {
                    s.sortingOrder = order;
                }
                return;
            }
        }
        const target = this.renderNode ?? this.node;
        const s = target.getComponent(Sorting2D);
        if (s) {
            s.sortingOrder = order;
        }
    }

    private _clampOrder(v: number): number {
        return Math.max(SORT_MIN, Math.min(SORT_MAX, v));
    }
}
