import { _decorator, Component, Node, Collider2D } from 'cc';
import { ShopItemType } from '../core/Enums';
import { EventBus, GameEvent, ShopPurchasePayload } from '../core/GameEvent';
import { PurchaseTrigger } from '../shop/PurchaseTrigger';
import { Stall } from '../economy/Stall';
import { ResourceEconomySystem } from '../economy/ResourceEconomySystem';

const { ccclass, property } = _decorator;

/**
 * 第四阶段：烤肉摊位点。
 * - 任意英雄解锁后开放购买 UI
 * - 购买后显示摊位，并隐藏占位围墙（replaceWalls）
 *
 * 场景建议：
 * City/Purchases/BuyCookedStall  [PurchaseTrigger, itemType=CookedMeatStall]
 * City/Stalls/Stall_CookedMeat   [Stall, stallId=stall_cooked, active=false]
 * Walls 下若干墙段拖进 replaceWalls
 */
@ccclass('CookedStallSite')
export class CookedStallSite extends Component {
    @property({ type: PurchaseTrigger, tooltip: '烤肉摊购买点 BuyCookedStall（开局锁定）' })
    public purchaseTrigger: PurchaseTrigger | null = null;

    @property({ type: Node, tooltip: '烤肉摊根节点 Stall_CookedMeat（开局 inactive）' })
    public stallRoot: Node | null = null;

    @property({ type: Stall, tooltip: '烤肉摊 Stall 组件（空则从 stallRoot 取）' })
    public stall: Stall | null = null;

    @property({
        type: [Node],
        tooltip: '摊位占位围墙：购买摊位后隐藏并关掉碰撞（把墙段拖进来）',
    })
    public replaceWalls: Node[] = [];

    @property({ tooltip: '摊位 stallId（须与 PurchaseTrigger.stallId、Stall.stallId 一致）' })
    public stallId: string = 'stall_cooked';

    private _purchaseUnlocked: boolean = false;
    private _stallOpened: boolean = false;

    protected onLoad(): void {
        this._autoBind();
        // 开局：关购买、关摊位、围墙保持显示
        if (this.purchaseTrigger) {
            this.purchaseTrigger.setUnlocked(false);
            this.purchaseTrigger.node.active = false;
        }
        if (this.stallRoot) {
            this.stallRoot.active = false;
        }
        EventBus.on(GameEvent.HERO_CREATED, this._onHeroCreated, this);
        EventBus.on(GameEvent.SHOP_PURCHASE_SUCCESS, this._onShopSuccess, this);
        EventBus.on(GameEvent.CMD_CREATE_STALL, this._onCreateStallCmd, this);
        // 保证在其他组件 onLoad 之后仍保持锁定
        this.scheduleOnce(() => {
            if (!this._purchaseUnlocked && !this._stallOpened && this.purchaseTrigger) {
                this.purchaseTrigger.setUnlocked(false);
                this.purchaseTrigger.node.active = false;
            }
            if (!this._stallOpened && this.stallRoot) {
                this.stallRoot.active = false;
            }
        }, 0);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.HERO_CREATED, this._onHeroCreated, this);
        EventBus.off(GameEvent.SHOP_PURCHASE_SUCCESS, this._onShopSuccess, this);
        EventBus.off(GameEvent.CMD_CREATE_STALL, this._onCreateStallCmd, this);
    }

    private _autoBind(): void {
        if (!this.purchaseTrigger) {
            const buy =
                this.node.getChildByName('BuyCookedStall') ??
                this.node.parent?.getChildByName('Purchases')?.getChildByName('BuyCookedStall') ??
                null;
            this.purchaseTrigger =
                buy?.getComponent(PurchaseTrigger) ??
                this.getComponentInChildren(PurchaseTrigger) ??
                null;
        }
        if (!this.stallRoot) {
            this.stallRoot =
                this.node.getChildByName('Stall_CookedMeat') ??
                this.node.parent?.getChildByName('Stalls')?.getChildByName('Stall_CookedMeat') ??
                null;
        }
        if (!this.stall && this.stallRoot) {
            this.stall = this.stallRoot.getComponent(Stall) ?? this.stallRoot.getComponentInChildren(Stall);
        }
        if (this.stall && !this.stallId) {
            this.stallId = this.stall.stallId;
        }
        if (this.purchaseTrigger && !this.purchaseTrigger.stallId) {
            this.purchaseTrigger.stallId = this.stallId || 'stall_cooked';
        }
    }

    private _onHeroCreated(): void {
        this.unlockPurchase();
    }

    /** 任意英雄创建后开放烤肉摊购买 */
    public unlockPurchase(): void {
        if (this._purchaseUnlocked || this._stallOpened) {
            return;
        }
        this._purchaseUnlocked = true;
        const pt = this.purchaseTrigger;
        const root = pt?.node;
        if (!root) {
            return;
        }
        root.active = true;
        if (pt.uiRoot) {
            pt.uiRoot.active = true;
        }
        pt.setUnlocked(true);
    }

    private _onShopSuccess(data: ShopPurchasePayload): void {
        if (data.itemType !== ShopItemType.CookedMeatStall) {
            return;
        }
        if (data.stallId && data.stallId !== this.stallId) {
            return;
        }
        this.openStall();
    }

    private _onCreateStallCmd(data: { stallType: number; stallId: string }): void {
        if (data.stallId !== this.stallId) {
            return;
        }
        this.openStall();
    }

    /** 购买成功：亮摊位、拆占位墙、登记经济系统 */
    public openStall(): void {
        if (this._stallOpened) {
            return;
        }
        this._stallOpened = true;

        if (this.purchaseTrigger) {
            this.purchaseTrigger.setUnlocked(false);
            this.purchaseTrigger.node.active = false;
        }

        const root = this.stallRoot ?? this.stall?.node ?? null;
        if (root) {
            root.active = true;
        }
        const stall =
            this.stall ??
            root?.getComponent(Stall) ??
            root?.getComponentInChildren(Stall) ??
            null;
        this.stall = stall;
        if (stall) {
            stall.stallId = this.stallId || stall.stallId;
            stall.setHelperActive(true);
        }

        this._clearReplaceWalls();
        this._registerStall(stall);
    }

    private _clearReplaceWalls(): void {
        for (const wall of this.replaceWalls || []) {
            if (!wall || !wall.isValid) {
                continue;
            }
            for (const col of wall.getComponents(Collider2D)) {
                col.enabled = false;
            }
            for (const col of wall.getComponentsInChildren(Collider2D)) {
                col.enabled = false;
            }
            wall.active = false;
        }
    }

    private _registerStall(stall: Stall | null): void {
        if (!stall) {
            return;
        }
        const eco = this.node.scene?.getComponentInChildren(ResourceEconomySystem);
        if (eco && eco.stalls.indexOf(stall) < 0) {
            eco.stalls.push(stall);
        }
    }
}
