import { _decorator, Component, Node, Prefab, instantiate, Vec3, Enum, tween, Tween } from 'cc';
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
    private _advanceGen: number = 0;

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
        this._busy = false;
        this._refreshHeadUI();
        this._refreshDepthOrder();
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

    /**
     * Y 越高越靠后：兄弟节点顺序 + SortingOrder2D 同步，避免后排盖住队首。
     */
    private _refreshDepthOrder(): void {
        if (!this.queueRoot) {
            return;
        }
        const sorted = this._customers
            .filter((c) => c?.isValid)
            .slice()
            .sort((a, b) => b.node.worldPosition.y - a.node.worldPosition.y);
        for (let i = 0; i < sorted.length; i++) {
            sorted[i].node.setSiblingIndex(i);
            sorted[i].refreshSorting();
        }
    }

    private _refreshHeadUI(): void {
        for (let i = 0; i < this._customers.length; i++) {
            const c = this._customers[i];
            if (!c?.isValid) {
                continue;
            }
            c.setShowDemand(i === 0 && !this._busy);
        }
    }

    /** 向队首交付 1 单位（飞入落地后调用）；需求清零才离场 */
    public tryDeliverOne(onCoin?: (coin: number) => void): boolean {
        const head = this.head;
        if (!head || this._busy) {
            return false;
        }
        if (head.demandLeft <= 0) {
            return false;
        }
        const finished = head.deliverOne();
        const coinPer = GameConstants.RESOURCE_COIN_VALUE[this.demandType] ?? 0;
        onCoin?.(coinPer);
        if (!finished) {
            return true;
        }
        // 先展示打钩，停留后再离场（勿立刻藏气泡）
        this._busy = true;
        head.holdCheckThenLeave(this.leaveDir, () => {
            if (head.isValid) {
                Tween.stopAllByTarget(head.node);
                head.node.destroy();
            }
            this._customers.shift();
            this._pruneInvalid();
            this._advanceAndSpawnTail();
        });
        return true;
    }

    private _pruneInvalid(): void {
        this._customers = this._customers.filter((c) => c?.isValid && c.node?.isValid);
    }

    private _advanceAndSpawnTail(): void {
        this._pruneInvalid();
        const gen = ++this._advanceGen;
        const dur = 0.35;
        const list = this._customers.slice();

        if (list.length === 0) {
            this._finishAdvance(gen);
            return;
        }

        let remaining = list.length;
        const onOneDone = (): void => {
            remaining -= 1;
            if (remaining <= 0) {
                this._finishAdvance(gen);
            }
        };

        for (let i = 0; i < list.length; i++) {
            const c = list[i];
            if (!c?.isValid) {
                onOneDone();
                continue;
            }
            c.setShowDemand(false);
            const target = this._posForIndex(i);
            const start = c.node.position;
            const dx = target.x - start.x;
            const dy = target.y - start.y;
            if (dx * dx + dy * dy < 0.25) {
                c.node.setPosition(target);
                c.setWalking(false);
                onOneDone();
                continue;
            }
            c.setWalking(true);
            Tween.stopAllByTarget(c.node);
            tween(c.node)
                .to(dur, { position: target })
                .call(() => {
                    if (c.isValid) {
                        c.setWalking(false);
                    }
                    onOneDone();
                })
                .start();
        }

        // 兜底：防止个别 tween 未回调导致永久 _busy / 走路
        this.scheduleOnce(() => this._finishAdvance(gen), dur + 0.2);
    }

    private _finishAdvance(gen: number): void {
        if (gen !== this._advanceGen || !this._busy) {
            return;
        }
        this._pruneInvalid();
        if (this._customers.length < this.maxCount) {
            this._spawnAtIndex(this._customers.length);
        }
        for (const c of this._customers) {
            if (c?.isValid) {
                c.setWalking(false);
            }
        }
        this._busy = false;
        this._refreshHeadUI();
        this._refreshDepthOrder();
    }
}
