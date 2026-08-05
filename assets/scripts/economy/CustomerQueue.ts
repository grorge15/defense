import { _decorator, Component, Node, Prefab, instantiate, Vec3, Enum } from 'cc';
import { ResourceType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { Customer } from './Customer';

const { ccclass, property } = _decorator;

/**
 * 顾客队列：后一位在前一位右上角；队首显示需求；完成后向右离场并前移补人。
 */
@ccclass('CustomerQueue')
export class CustomerQueue extends Component {
    @property({ type: Prefab, tooltip: '顾客预制体 pref_customer / customer' })
    public customerPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: '队列起点（队首站位）；为空则用本节点' })
    public queueRoot: Node | null = null;

    @property({ tooltip: '相对上一位的水平间距（右为正）' })
    public spacingX: number = 32;

    @property({ tooltip: '相对上一位的竖直间距（上为正）' })
    public spacingY: number = 28;

    @property({ tooltip: '离场位移（世界坐标增量，默认向右走出屏幕）' })
    public leaveDir: Vec3 = new Vec3(520, 0, 0);

    @property({ type: Enum(ResourceType), tooltip: '本队列需求资源类型' })
    public demandType: ResourceType = ResourceType.RawMeat;

    @property({ tooltip: '队列最大人数' })
    public maxCount: number = GameConstants.CUSTOMER_QUEUE_MAX;

    private _customers: Customer[] = [];
    private _busy: boolean = false;

    public get head(): Customer | null {
        return this._customers.length > 0 ? this._customers[0] : null;
    }

    public get isTrading(): boolean {
        return this._busy;
    }

    protected onLoad(): void {
        if (!this.queueRoot) {
            this.queueRoot = this.node;
        }
    }

    protected start(): void {
        this._syncDemandFromParentStall();
        this._rebuildInitial();
    }

    /** 从父级 Stall 同步需求类型，避免烤肉摊仍按生肉刷 ItemIcon */
    private _syncDemandFromParentStall(): void {
        let n: Node | null = this.node;
        for (let i = 0; i < 4 && n; i++) {
            const stall = n.getComponent('Stall') as { tradeResourceType?: ResourceType } | null;
            if (stall && stall.tradeResourceType !== undefined) {
                this.demandType = stall.tradeResourceType;
                return;
            }
            n = n.parent;
        }
    }

    private _rebuildInitial(): void {
        if (!this.queueRoot) {
            this.queueRoot = this.node;
        }
        if (!this.customerPrefab) {
            console.warn('[CustomerQueue] customerPrefab 未绑定，无法生成顾客', this.node.name);
            return;
        }
        for (let i = 0; i < this.maxCount; i++) {
            this._spawnAtIndex(i);
        }
        this._refreshHeadUI();
    }

    private _spawnAtIndex(index: number): Customer | null {
        if (!this.customerPrefab || !this.queueRoot) {
            return null;
        }
        const node = instantiate(this.customerPrefab);
        node.parent = this.queueRoot;
        node.setPosition(this._posForIndex(index));
        const c = node.getComponent(Customer);
        if (c) {
            c.setupRandomDemand(this.demandType);
            this._customers.push(c);
        }
        return c;
    }

    /** 第 0 位在原点，之后每位在上一位右上角 */
    private _posForIndex(index: number): Vec3 {
        return new Vec3(this.spacingX * index, this.spacingY * index, 0);
    }

    private _refreshHeadUI(): void {
        for (let i = 0; i < this._customers.length; i++) {
            this._customers[i].setShowDemand(i === 0);
        }
    }

    /** 向队首交付 1 单位资源，完成则向右离场并前移 */
    public tryDeliverOne(onCoin?: (coin: number) => void): boolean {
        const head = this.head;
        if (!head || this._busy) {
            return false;
        }
        const finished = head.deliverOne();
        const coinPer = GameConstants.RESOURCE_COIN_VALUE[this.demandType] ?? 0;
        onCoin?.(coinPer);
        if (!finished) {
            return true;
        }
        this._busy = true;
        head.leave(this.leaveDir, () => {
            if (head.isValid) {
                head.node.destroy();
            }
            this._customers.shift();
            this._advanceAndSpawnTail();
            this._busy = false;
        });
        return true;
    }

    private _advanceAndSpawnTail(): void {
        for (let i = 0; i < this._customers.length; i++) {
            const c = this._customers[i];
            const target = this._posForIndex(i);
            const start = c.node.position.clone();
            let t = 0;
            const dur = 0.35;
            const tick = (dt: number) => {
                t += dt;
                const k = Math.min(1, t / dur);
                c.node.setPosition(
                    start.x + (target.x - start.x) * k,
                    start.y + (target.y - start.y) * k,
                    0,
                );
                if (k >= 1) {
                    this.unschedule(tick);
                }
            };
            this.schedule(tick);
        }
        this.scheduleOnce(() => {
            if (this._customers.length < this.maxCount) {
                this._spawnAtIndex(this._customers.length);
            }
            this._refreshHeadUI();
        }, 0.4);
    }
}
