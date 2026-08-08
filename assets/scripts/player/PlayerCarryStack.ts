import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { ResourceType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { SortingOrder2D } from '../core/SortingOrder2D';

const { ccclass, property } = _decorator;

/** 同背负内类型层级步进：须大于 CARRY_STACK_VISUAL_MAX，避免高层 meat 盖住低层 coin */
const CARRY_TYPE_LAYER_SCALE = 80;

/**
 * 玩家背部资源堆叠：右→左顺序 金币、肉、木材；同种向上堆叠，视觉上限见 CARRY_STACK_VISUAL_MAX。
 * 数量变化时增量增删节点，避免整堆销毁重建导致“飞到一半背上已经出现”。
 */
@ccclass('PlayerCarryStack')
export class PlayerCarryStack extends Component {
    @property({ type: Node, tooltip: '背负根节点，标识堆叠起始位置' })
    public carryRoot: Node | null = null;

    @property({ type: Prefab, tooltip: '金币表现预制体' })
    public coinPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '生肉/烤肉表现预制体（肉类共用）' })
    public meatPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '木头表现预制体' })
    public woodPrefab: Prefab | null = null;

    @property({ tooltip: '同种资源竖直堆叠间距' })
    public stackGap: number = GameConstants.CARRY_STACK_GAP;

    @property({ tooltip: '不同资源类型水平间距' })
    public typeGap: number = GameConstants.CARRY_TYPE_GAP;

    private _counts: Map<ResourceType, number> = new Map([
        [ResourceType.Coin, 0],
        [ResourceType.RawMeat, 0],
        [ResourceType.CookedMeat, 0],
        [ResourceType.Wood, 0],
    ]);

    private _visuals: Map<ResourceType, Node[]> = new Map();

    protected onLoad(): void {
        if (!this.carryRoot) {
            this.carryRoot = this.node.getChildByName('CarryRoot');
        }
    }

    protected lateUpdate(): void {
        this._syncCarryPriorities();
    }

    public getCount(type: ResourceType): number {
        return this._counts.get(type) ?? 0;
    }

    /** 设为绝对值并刷新堆叠（金币背部与钱包同步用） */
    public setCount(type: ResourceType, count: number): void {
        this._counts.set(type, Math.max(0, Math.floor(count)));
        this._syncVisual(type);
    }

    public add(type: ResourceType, amount: number = 1): void {
        const cur = this.getCount(type);
        this._counts.set(type, cur + amount);
        this._syncVisual(type);
    }

    public remove(type: ResourceType, amount: number = 1): number {
        const cur = this.getCount(type);
        const take = Math.min(cur, amount);
        this._counts.set(type, cur - take);
        this._syncVisual(type);
        return take;
    }

    public clearType(type: ResourceType): number {
        const cur = this.getCount(type);
        this._counts.set(type, 0);
        this._syncVisual(type);
        return cur;
    }

    /**
     * 金币堆最上层相对 CarryRoot 的本地高度（无金币为 0）。
     */
    public getTopCoinHeight(): number {
        const list = this._visuals.get(ResourceType.Coin);
        if (!list || list.length === 0) {
            const n = Math.min(this.getCount(ResourceType.Coin), GameConstants.CARRY_STACK_VISUAL_MAX);
            return n > 0 ? (n - 1) * this.stackGap : 0;
        }
        const top = list[list.length - 1];
        return top?.isValid ? top.position.y : (list.length - 1) * this.stackGap;
    }

    /**
     * 拾取飞弧：至少 PICKUP_FLY_ARC，并高出当前最上层金币一截，避免穿堆。
     */
    public getPickupFlyArc(): number {
        const topH = this.getTopCoinHeight();
        const clear = this.stackGap * 2;
        return Math.max(GameConstants.PICKUP_FLY_ARC, topH + clear);
    }

    private _prefabFor(type: ResourceType): Prefab | null {
        switch (type) {
            case ResourceType.Coin:
                return this.coinPrefab;
            case ResourceType.Wood:
                return this.woodPrefab;
            default:
                return this.meatPrefab;
        }
    }

    /** 排列顺序：右→左 金币、肉、木材 */
    private _typeColumnIndex(type: ResourceType): number {
        switch (type) {
            case ResourceType.Coin:
                return 0;
            case ResourceType.RawMeat:
            case ResourceType.CookedMeat:
                return 1;
            case ResourceType.Wood:
                return 2;
            default:
                return 0;
        }
    }

    /** 从已实例化节点读 SortingOrder2D.orderOffset（prefab.data 读不到 Visual 子节点上的值） */
    private _instanceLayerOffset(node: Node): number {
        const sort = node.getComponent(SortingOrder2D) ?? node.getComponentInChildren(SortingOrder2D);
        return (sort?.orderOffset ?? 0) * CARRY_TYPE_LAYER_SCALE;
    }

    /** 按数量增量增删，只补缺 / 去掉多余，不整堆重建 */
    private _syncVisual(type: ResourceType): void {
        if (!this.carryRoot) {
            return;
        }
        let list = this._visuals.get(type);
        if (!list) {
            list = [];
            this._visuals.set(type, list);
        }
        const target = Math.min(this.getCount(type), GameConstants.CARRY_STACK_VISUAL_MAX);
        const prefab = this._prefabFor(type);
        const col = this._typeColumnIndex(type);
        const x = -col * this.typeGap;

        while (list.length > target) {
            const n = list.pop();
            n?.destroy();
        }
        if (prefab) {
            while (list.length < target) {
                const i = list.length;
                const n = instantiate(prefab);
                n.parent = this.carryRoot;
                n.setPosition(x, i * this.stackGap, 0);
                list.push(n);
            }
        }
        for (let i = 0; i < list.length; i++) {
            const n = list[i];
            if (n?.isValid) {
                n.setPosition(x, i * this.stackGap, 0);
            }
        }
        this._syncCarryPriorities();
    }

    private _syncCarryPriorities(): void {
        if (!this.carryRoot || this._visuals.size === 0) {
            return;
        }
        const baseY = Math.round(this.carryRoot.worldPosition.y);
        for (const [, list] of this._visuals) {
            for (let i = 0; i < list.length; i++) {
                const n = list[i];
                if (!n?.isValid) {
                    continue;
                }
                const sort = n.getComponent(SortingOrder2D) ?? n.getComponentInChildren(SortingOrder2D);
                if (!sort) {
                    continue;
                }
                const layer = this._instanceLayerOffset(n);
                sort.setFixedPriority(-baseY + layer + i);
            }
        }
    }
}
