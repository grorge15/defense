import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { ResourceType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { SortingOrder2D } from '../core/SortingOrder2D';

const { ccclass, property } = _decorator;

/**
 * 玩家背部资源堆叠：右→左顺序 金币、肉、木材；同种向上堆叠，视觉上限 10。
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

    public getCount(type: ResourceType): number {
        return this._counts.get(type) ?? 0;
    }

    /** 设为绝对值并刷新堆叠（金币背部与钱包同步用） */
    public setCount(type: ResourceType, count: number): void {
        this._counts.set(type, Math.max(0, Math.floor(count)));
        this._rebuildVisual(type);
    }

    public add(type: ResourceType, amount: number = 1): void {
        const cur = this.getCount(type);
        this._counts.set(type, cur + amount);
        this._rebuildVisual(type);
    }

    public remove(type: ResourceType, amount: number = 1): number {
        const cur = this.getCount(type);
        const take = Math.min(cur, amount);
        this._counts.set(type, cur - take);
        this._rebuildVisual(type);
        return take;
    }

    public clearType(type: ResourceType): number {
        const cur = this.getCount(type);
        this._counts.set(type, 0);
        this._rebuildVisual(type);
        return cur;
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

    private _rebuildVisual(type: ResourceType): void {
        if (!this.carryRoot) {
            return;
        }
        let list = this._visuals.get(type);
        if (!list) {
            list = [];
            this._visuals.set(type, list);
        }
        for (const n of list) {
            n.destroy();
        }
        list.length = 0;

        const count = this.getCount(type);
        const visualCount = Math.min(count, GameConstants.CARRY_STACK_VISUAL_MAX);
        const prefab = this._prefabFor(type);
        if (!prefab || visualCount <= 0) {
            return;
        }
        const col = this._typeColumnIndex(type);
        // 右→左：列 0 在右侧
        const x = -col * this.typeGap;
        for (let i = 0; i < visualCount; i++) {
            const n = instantiate(prefab);
            n.parent = this.carryRoot;
            n.setPosition(x, i * this.stackGap, 0);
            const sort = n.getComponent(SortingOrder2D) ?? n.getComponentInChildren(SortingOrder2D);
            sort?.setAttachedToCarrier(true);
            list.push(n);
        }
    }
}
