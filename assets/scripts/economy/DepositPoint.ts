import { _decorator, Component, Node, Prefab, instantiate, Vec3, Enum } from 'cc';
import { DepositType, ResourceType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { EventBus, GameEvent } from '../core/GameEvent';
import { flyResourceTo } from '../core/FlyTween';
import { SortingOrder2D } from '../core/SortingOrder2D';

const { ccclass, property } = _decorator;

/**
 * 放置点：生肉 6 / 木头 4 / 金币 4 个占位。
 * 有 slot 时按位填充，同 slot 超量则竖直堆叠；无 slot 时在本节点竖直堆叠。
 */
@ccclass('DepositPoint')
export class DepositPoint extends Component {
    @property({ tooltip: '放置点唯一 ID' })
    public depositId: string = 'deposit_0';

    @property({ type: Enum(DepositType), tooltip: '放置点类型' })
    public depositType: DepositType = DepositType.RawMeat;

    @property({ type: [Node], tooltip: '占位节点列表（按顺序填满）' })
    public slots: Node[] = [];

    @property({ type: Prefab, tooltip: '资源表现预制体（肉/木/金币）' })
    public resourcePrefab: Prefab | null = null;

    @property({ tooltip: '竖直堆叠间距' })
    public stackGap: number = GameConstants.DEPOSIT_STACK_GAP;

    @property({ tooltip: '绑定摊位 ID（生肉储肉地块）' })
    public boundStallId: string = '';

    private _stock: number = 0;
    private _visuals: Node[] = [];

    public get stock(): number {
        return this._stock;
    }

    public get resourceType(): ResourceType {
        switch (this.depositType) {
            case DepositType.Wood:
                return ResourceType.Wood;
            case DepositType.Coin:
                return ResourceType.Coin;
            default:
                return ResourceType.RawMeat;
        }
    }

    public get capacity(): number {
        switch (this.depositType) {
            case DepositType.Wood:
                return GameConstants.DEPOSIT_SLOT_WOOD * GameConstants.DEPOSIT_STACK_LAYERS;
            case DepositType.Coin:
                return GameConstants.DEPOSIT_COIN_STOCK_CAP;
            default:
                // 生肉（含英雄塔储肉区）：占位×层数，满仓前击杀都会飞入
                return GameConstants.DEPOSIT_SLOT_RAW_MEAT * GameConstants.DEPOSIT_STACK_LAYERS;
        }
    }

    /** 表现：每格最多 DEPOSIT_STACK_LAYERS 层；无格则单列堆到同层数 */
    public get visualCapacity(): number {
        this._ensureSlots();
        const layers = GameConstants.DEPOSIT_STACK_LAYERS;
        const bases =
            this.slots.length > 0
                ? this.slots.length
                : this.depositType === DepositType.Wood
                  ? GameConstants.DEPOSIT_SLOT_WOOD
                  : this.depositType === DepositType.Coin
                    ? GameConstants.DEPOSIT_SLOT_COIN
                    : GameConstants.DEPOSIT_SLOT_RAW_MEAT;
        return bases * layers;
    }

    protected onLoad(): void {
        this._ensureSlots();
    }

    /** 直接入库（英雄击杀 / 顾客结算产出） */
    public addStock(amount: number, fromWorldPos?: Vec3): void {
        const can = Math.min(amount, this.capacity - this._stock);
        if (can <= 0) {
            return;
        }
        this._stock += can;
        this._refreshVisual(fromWorldPos);
        EventBus.emit(GameEvent.DEPOSIT_STOCK_CHANGED, {
            depositId: this.depositId,
            stock: this._stock,
            type: this.depositType,
        });
    }

    public takeStock(amount: number): number {
        const take = Math.min(amount, this._stock);
        this._stock -= take;
        this._refreshVisual();
        EventBus.emit(GameEvent.DEPOSIT_STOCK_CHANGED, {
            depositId: this.depositId,
            stock: this._stock,
            type: this.depositType,
        });
        return take;
    }

    /** 填补 slots：过滤空引用，或按 pos/slot 子节点名自动绑定 */
    private _ensureSlots(): void {
        const cleaned = (this.slots || []).filter((s) => !!s && s.isValid);
        if (cleaned.length > 0) {
            this.slots = cleaned;
            return;
        }
        const kids = this.node.children.filter((c) => {
            const n = c.name.toLowerCase();
            return n.startsWith('pos') || n.startsWith('slot') || n.includes('占位');
        });
        if (kids.length > 0) {
            kids.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            this.slots = kids;
            return;
        }
        this.slots = [];
    }

    private _slotForIndex(index: number): Node | null {
        if (this.slots.length <= 0) {
            return null;
        }
        return this.slots[index % this.slots.length];
    }

    private _localDestForIndex(index: number): Vec3 {
        const slotCount = this.slots.length;
        if (slotCount <= 0) {
            return new Vec3(0, index * this.stackGap, 0);
        }
        const stackLayer = Math.floor(index / slotCount);
        return new Vec3(0, stackLayer * this.stackGap, 0);
    }

    private _worldDestForIndex(index: number): Vec3 {
        const slot = this._slotForIndex(index);
        const local = this._localDestForIndex(index);
        if (slot) {
            const wp = slot.worldPosition;
            return new Vec3(wp.x, wp.y + local.y, 0);
        }
        const wp = this.node.worldPosition;
        return new Vec3(wp.x, wp.y + local.y, 0);
    }

    private _refreshVisual(fromWorldPos?: Vec3): void {
        this._ensureSlots();
        const visualTarget = Math.min(this._stock, this.visualCapacity);
        while (this._visuals.length > visualTarget) {
            const n = this._visuals.pop();
            n?.destroy();
        }
        if (!this.resourcePrefab) {
            return;
        }
        while (this._visuals.length < visualTarget) {
            const idx = this._visuals.length;
            const slot = this._slotForIndex(idx);
            const parent = slot ?? this.node;
            const localDest = this._localDestForIndex(idx);
            const n = instantiate(this.resourcePrefab);
            // 飞行过程挂在 deposit 节点下（勿挂 Scene，否则世界坐标/层易错）
            n.parent = this.node;
            if (fromWorldPos) {
                n.setWorldPosition(fromWorldPos.x, fromWorldPos.y, 0);
                const destWorld = this._worldDestForIndex(idx);
                flyResourceTo(n, destWorld, GameConstants.FLY_DURATION, GameConstants.FLY_ARC_HEIGHT, () => {
                    if (!n.isValid) {
                        return;
                    }
                    n.parent = parent;
                    n.setPosition(localDest);
                    const sort = n.getComponent(SortingOrder2D) ?? n.getComponentInChildren(SortingOrder2D);
                    sort?.applyOrder();
                });
            } else {
                n.parent = parent;
                n.setPosition(localDest);
                const sort = n.getComponent(SortingOrder2D) ?? n.getComponentInChildren(SortingOrder2D);
                sort?.applyOrder();
            }
            this._visuals.push(n);
        }
    }
}
