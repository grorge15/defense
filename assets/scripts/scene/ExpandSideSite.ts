import { _decorator, Component, Node, Enum, Collider2D } from 'cc';
import { ExpandSide, ShopItemType, StallType } from '../core/Enums';
import { EventBus, GameEvent, ShopPurchasePayload } from '../core/GameEvent';
import { PurchaseTrigger } from '../shop/PurchaseTrigger';
import { Stall } from '../economy/Stall';
import { DepositPoint } from '../economy/DepositPoint';
import { ArrowTower } from '../combat/ArrowTower';
import { ResourceEconomySystem } from '../economy/ResourceEconomySystem';

const { ccclass, property } = _decorator;

/**
 * 第五阶段·单侧拓展站点（东或西各挂一份）。
 *
 * 流程：
 * 1. 烤肉摊买完后 → 开放 BuyExpand（180）购买 UI
 * 2. 付清拓展 → SceneTileSystem 亮 ExpandEast/West；隐藏 replaceWalls
 * 3. 区域内：木头摊（自带帮手）、伐木工购买、拓展箭塔建造
 *
 * 节点含义（摆位时）：
 * - BuyExpand：城边拓展购买点（必须在 Expand 区域外，否则区域 inactive 时买不到）
 * - woodStallRoot：木头摊 Stall_Wood（区域解锁后显示）
 * - buyLumberjack：伐木工购买（区域解锁后开放）
 * - towerBuildTrigger：拓展箭塔 BuildTrigger（区域解锁后开放）
 * - replaceWalls：拓展买完后要拆掉的墙段（拖进列表）
 * - woodDeposits：拓展买完后显示的 Deposit_wood（开局 inactive）
 */
@ccclass('ExpandSideSite')
export class ExpandSideSite extends Component {
    @property({ type: Enum(ExpandSide), tooltip: '本侧方向 East=0 / West=1' })
    public side: ExpandSide = ExpandSide.East;

    @property({
        type: PurchaseTrigger,
        tooltip: '拓展地块购买点 BuyExpand（itemType=ExpandArea；开局锁定）',
    })
    public buyExpand: PurchaseTrigger | null = null;

    @property({
        type: Node,
        tooltip: '拓展区域根 ExpandEast / ExpandWest（由 SceneTileSystem 开关 active）',
    })
    public areaRoot: Node | null = null;

    @property({
        type: PurchaseTrigger,
        tooltip: '伐木工购买 BuyLumberjack（itemType=Lumberjack；区域解锁后开放）',
    })
    public buyLumberjack: PurchaseTrigger | null = null;

    @property({
        type: Node,
        tooltip: '木头摊根 Stall_Wood（区域解锁后显示；自带帮手）',
    })
    public woodStallRoot: Node | null = null;

    @property({ type: Stall, tooltip: '木头摊 Stall（空则从 woodStallRoot 取）' })
    public woodStall: Stall | null = null;

    @property({
        type: PurchaseTrigger,
        tooltip: '拓展箭塔建造点（itemType=ExpandTower；须填 towerId=tower_east/west）',
    })
    public towerBuildTrigger: PurchaseTrigger | null = null;

    @property({ type: ArrowTower, tooltip: '本侧拓展箭塔（isExpandTower=true）' })
    public expandTower: ArrowTower | null = null;

    @property({
        type: [Node],
        tooltip: '拓展购买结算后隐藏的墙：把要拆的墙段拖进此列表（会关碰撞并 active=false）',
    })
    public replaceWalls: Node[] = [];

    @property({
        type: [Node],
        tooltip: '拓展购买结算后显示的木头放置点 Deposit_wood（开局应 inactive；可拖多个）',
    })
    public woodDeposits: Node[] = [];

    @property({ tooltip: '木头摊 stallId（东 stall_wood_east / 西 stall_wood_west）' })
    public woodStallId: string = 'stall_wood_east';

    @property({
        tooltip:
            '【测试开关】勾选后开局直接解锁本侧拓展：亮区域、拆 replaceWalls、开木头摊/伐木工/箭塔购买（跳过烤肉摊与付费）',
    })
    public debugForceUnlock: boolean = false;

    private _expandBuyUnlocked = false;
    private _sideOpened = false;

    protected onLoad(): void {
        this._autoBind();
        this._lockExpandBuy();
        this._lockSideContent();
        EventBus.on(GameEvent.SHOP_PURCHASE_SUCCESS, this._onShopSuccess, this);
        EventBus.on(GameEvent.EXPAND_UNLOCKED, this._onExpandUnlocked, this);
        this.scheduleOnce(() => {
            if (this.debugForceUnlock) {
                this._applyDebugForceUnlock();
                return;
            }
            if (!this._expandBuyUnlocked) {
                this._lockExpandBuy();
            }
            if (!this._sideOpened) {
                this._lockSideContent();
            }
        }, 0);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.SHOP_PURCHASE_SUCCESS, this._onShopSuccess, this);
        EventBus.off(GameEvent.EXPAND_UNLOCKED, this._onExpandUnlocked, this);
    }

    private _autoBind(): void {
        if (!this.buyExpand) {
            const n =
                this.node.getChildByName('BuyExpand') ??
                this.node.parent?.getChildByName('BuyExpand') ??
                null;
            this.buyExpand = n?.getComponent(PurchaseTrigger) ?? null;
        }
        if (!this.areaRoot) {
            const name = this.side === ExpandSide.West ? 'ExpandWest' : 'ExpandEast';
            this.areaRoot =
                this.node.getChildByName(name) ??
                this.node.scene?.getChildByName('GameRoot')?.getChildByName('World')?.getChildByName(name) ??
                null;
        }
        if (!this.buyLumberjack && this.areaRoot) {
            const n = this.areaRoot.getChildByName('BuyLumberjack');
            this.buyLumberjack = n?.getComponent(PurchaseTrigger) ?? null;
        }
        if (!this.woodStallRoot && this.areaRoot) {
            this.woodStallRoot =
                this.areaRoot.getChildByName('Stall_Wood') ??
                this.areaRoot.getChildByName('Stalls')?.getChildByName('Stall_Wood') ??
                null;
        }
        if (!this.woodStallRoot) {
            this.woodStallRoot = this.node.getChildByName('Stall_Wood');
        }
        if (!this.woodStall && this.woodStallRoot) {
            this.woodStall =
                this.woodStallRoot.getComponent(Stall) ??
                this.woodStallRoot.getComponentInChildren(Stall);
        }
        if (!this.expandTower && this.areaRoot) {
            const tName = this.side === ExpandSide.West ? 'Tower_West' : 'Tower_East';
            const tn = this.areaRoot.getChildByName(tName);
            this.expandTower = tn?.getComponent(ArrowTower) ?? null;
        }
        if (!this.towerBuildTrigger && this.expandTower) {
            const build = this.expandTower.node.getChildByName('BuildTrigger');
            this.towerBuildTrigger = build?.getComponent(PurchaseTrigger) ?? null;
        }
        if (!this.towerBuildTrigger) {
            const build = this.node.getChildByName('BuildTrigger');
            this.towerBuildTrigger = build?.getComponent(PurchaseTrigger) ?? null;
        }
        if (this.buyExpand) {
            this.buyExpand.itemType = ShopItemType.ExpandArea;
            this.buyExpand.expandSide = this.side;
        }
        if (this.buyLumberjack) {
            this.buyLumberjack.itemType = ShopItemType.Lumberjack;
            this.buyLumberjack.expandSide = this.side;
        }
        if (this.towerBuildTrigger) {
            this.towerBuildTrigger.itemType = ShopItemType.ExpandTower;
            this.towerBuildTrigger.expandSide = this.side;
            if (this.expandTower) {
                this.towerBuildTrigger.towerId = this.expandTower.towerId;
            }
        }
        if (this.woodStall) {
            this.woodStall.stallId = this.woodStallId;
            this.woodStall.stallType = StallType.Wood;
        }
        if (this.expandTower) {
            this.expandTower.isExpandTower = true;
        }
        this._autoBindWoodDeposits();
    }

    private _autoBindWoodDeposits(): void {
        if (this.woodDeposits.length > 0) {
            return;
        }
        const roots: Node[] = [];
        if (this.areaRoot) {
            roots.push(this.areaRoot);
        }
        roots.push(this.node);
        const found: Node[] = [];
        for (const root of roots) {
            const walk = (n: Node) => {
                const name = n.name.toLowerCase();
                if (name === 'deposit_wood' || name === 'depositwood' || name.indexOf('deposit_wood') >= 0) {
                    if (found.indexOf(n) < 0) {
                        found.push(n);
                    }
                }
                for (const c of n.children) {
                    walk(c);
                }
            };
            walk(root);
        }
        this.woodDeposits = found;
    }

    private _lockExpandBuy(): void {
        if (!this.buyExpand) {
            return;
        }
        this.buyExpand.setUnlocked(false);
        this.buyExpand.node.active = false;
    }

    private _lockSideContent(): void {
        if (this.buyLumberjack) {
            this.buyLumberjack.setUnlocked(false);
            this.buyLumberjack.node.active = false;
        }
        if (this.towerBuildTrigger) {
            this.towerBuildTrigger.setUnlocked(false);
            this.towerBuildTrigger.node.active = false;
        }
        if (this.woodStallRoot) {
            this.woodStallRoot.active = false;
        }
        this._setWoodDepositsActive(false);
    }

    private _onShopSuccess(data: ShopPurchasePayload): void {
        if (data.itemType === ShopItemType.CookedMeatStall) {
            this.unlockExpandPurchase();
            return;
        }
        if (
            data.itemType === ShopItemType.ExpandArea &&
            (data.side === undefined || data.side === this.side)
        ) {
            // SceneTileSystem 会亮区域；内容在 EXPAND_UNLOCKED 里开
            this.openSideContent();
        }
    }

    private _onExpandUnlocked(data: { side: ExpandSide }): void {
        if (data.side !== this.side) {
            return;
        }
        this.openSideContent();
    }

    /** 烤肉摊完成后开放本侧拓展购买 */
    public unlockExpandPurchase(): void {
        if (this._expandBuyUnlocked) {
            return;
        }
        this._expandBuyUnlocked = true;
        const pt = this.buyExpand;
        if (!pt) {
            return;
        }
        pt.node.active = true;
        if (pt.uiRoot) {
            pt.uiRoot.active = true;
        }
        pt.setUnlocked(true);
    }

    /** 拓展购买成功：开木头摊+帮手、伐木工购买、箭塔建造 */
    public openSideContent(): void {
        if (this._sideOpened) {
            return;
        }
        this._sideOpened = true;

        if (this.buyExpand) {
            this.buyExpand.setUnlocked(false);
            this.buyExpand.node.active = false;
        }

        if (this.woodStallRoot) {
            this.woodStallRoot.active = true;
        }
        const stall =
            this.woodStall ??
            this.woodStallRoot?.getComponent(Stall) ??
            this.woodStallRoot?.getComponentInChildren(Stall) ??
            null;
        this.woodStall = stall;
        if (stall) {
            stall.stallId = this.woodStallId || stall.stallId;
            stall.stallType = StallType.Wood;
            stall.setHelperActive(true);
            this._registerStall(stall);
            const eco = this.node.scene?.getComponentInChildren(ResourceEconomySystem);
            if (eco && !stall.tradeVisualPrefab) {
                stall.tradeVisualPrefab = eco.woodPrefab ?? eco.rawMeatPrefab;
            }
            EventBus.emit(GameEvent.CMD_CREATE_HELPER, { stallId: stall.stallId });
        }

        if (this.buyLumberjack) {
            this.buyLumberjack.node.active = true;
            if (this.buyLumberjack.uiRoot) {
                this.buyLumberjack.uiRoot.active = true;
            }
            this.buyLumberjack.setUnlocked(true);
        }

        if (this.towerBuildTrigger) {
            this.towerBuildTrigger.node.active = true;
            if (this.towerBuildTrigger.uiRoot) {
                this.towerBuildTrigger.uiRoot.active = true;
            }
            this.towerBuildTrigger.setUnlocked(true);
        }

        // 建成拓展塔即通关：强制标记，并同步 BuildTrigger.towerId（避免西侧误用 tower_east）
        if (this.expandTower) {
            this.expandTower.isExpandTower = true;
            if (this.towerBuildTrigger) {
                this.towerBuildTrigger.towerId = this.expandTower.towerId;
                this.towerBuildTrigger.itemType = ShopItemType.ExpandTower;
                this.towerBuildTrigger.expandSide = this.side;
            }
        }

        this._hideReplaceWalls();
        this._showWoodDeposits();
    }

    private _setWoodDepositsActive(active: boolean): void {
        this._autoBindWoodDeposits();
        for (const n of this.woodDeposits || []) {
            if (n?.isValid) {
                n.active = active;
            }
        }
    }

    /** 解锁后显示木头放置点，并注册进经济系统 */
    private _showWoodDeposits(): void {
        this._setWoodDepositsActive(true);
        const eco = this.node.scene?.getComponentInChildren(ResourceEconomySystem);
        if (!eco) {
            return;
        }
        for (const n of this.woodDeposits || []) {
            if (!n?.isValid) {
                continue;
            }
            const dep =
                n.getComponent(DepositPoint) ?? n.getComponentInChildren(DepositPoint);
            if (!dep) {
                continue;
            }
            if (eco.deposits.indexOf(dep) < 0) {
                eco.deposits.push(dep);
            }
            // 与木头摊绑定，方便帮手取货
            if (this.woodStall && !this.woodStall.boundDeposit) {
                this.woodStall.boundDeposit = dep;
                dep.boundStallId = this.woodStall.stallId;
            }
        }
    }

    /** 测试：开局直接完成本侧拓展解锁 */
    private _applyDebugForceUnlock(): void {
        this._expandBuyUnlocked = true;
        EventBus.emit(GameEvent.CMD_UNLOCK_EXPAND, { side: this.side });
        // SceneTileSystem 会再发 EXPAND_UNLOCKED；此处直接开内容避免时序依赖
        this.openSideContent();
    }

    /** 拓展买完后隐藏占位墙并关掉碰撞 */
    private _hideReplaceWalls(): void {
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

    private _registerStall(stall: Stall): void {
        const eco = this.node.scene?.getComponentInChildren(ResourceEconomySystem);
        if (eco && eco.stalls.indexOf(stall) < 0) {
            eco.stalls.push(stall);
        }
    }
}
