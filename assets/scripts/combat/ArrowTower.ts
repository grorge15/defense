import { _decorator, Component, Node, instantiate } from 'cc';
import { DepositType, ShopItemType } from '../core/Enums';
import { EventBus, GameEvent, ShopPurchasePayload } from '../core/GameEvent';
import { PurchaseTrigger } from '../shop/PurchaseTrigger';
import { DepositPoint } from '../economy/DepositPoint';
import { ResourceEconomySystem } from '../economy/ResourceEconomySystem';

const { ccclass, property } = _decorator;

/**
 * 箭塔建造点：
 * - 建成后解锁帮手购买点（第三阶段前不开放英雄购买）
 * - 帮手购买成功后开放英雄购买 UI
 * - 英雄购买完成后：隐藏 HeroPurchase，在其位置启用/克隆独立 Deposit_RawMeat
 */
@ccclass('ArrowTower')
export class ArrowTower extends Component {
    @property({ tooltip: '箭塔唯一 ID' })
    public towerId: string = 'tower_south';

    @property({ tooltip: '是否为拓展区箭塔（建成即通关）' })
    public isExpandTower: boolean = false;

    @property({ type: Node, tooltip: '箭塔视觉节点（建造前隐藏）' })
    public visual: Node | null = null;

    @property({ type: Node, tooltip: '登塔触发区' })
    public mountTrigger: Node | null = null;

    @property({ type: Node, tooltip: '上塔地贴 / 下塔落点（建造前隐藏）' })
    public groundPoint: Node | null = null;

    @property({
        type: Node,
        tooltip: '英雄站立点（默认子节点 StandPoint）',
    })
    public heroStandPoint: Node | null = null;

    @property({
        type: Node,
        tooltip: '英雄购买 UI（买完后隐藏；其世界坐标用作生肉放置点位置）',
    })
    public heroPurchaseUI: Node | null = null;

    @property({ type: PurchaseTrigger, tooltip: '建造购买触发器（建造后隐藏）' })
    public buildTrigger: PurchaseTrigger | null = null;

    @property({ type: Node, tooltip: '帮手购买点（初始箭塔建成后解锁，可选）' })
    public helperPurchaseUI: Node | null = null;

    @property({
        type: DepositPoint,
        tooltip: '本塔专用生肉放置点 Deposit_RawMeat（可预埋 inactive；空则克隆场景模板）',
    })
    public meatDepositPoint: DepositPoint | null = null;

    @property({
        type: Node,
        tooltip: '克隆用模板节点（空则自动找 City/Deposits/Deposit_RawMeat）',
    })
    public meatDepositTemplate: Node | null = null;

    @property({ tooltip: '本塔储肉 depositId（空则用 towerId_meat_deposit）' })
    public meatDepositId: string = '';

    @property({ tooltip: '储肉地绑定的摊位 ID（帮手按此取肉）' })
    public boundStallId: string = 'stall_raw';

    private _built: boolean = false;
    private _hasHero: boolean = false;
    private _meatDeposit: DepositPoint | null = null;

    public get built(): boolean {
        return this._built;
    }

    public get hasHero(): boolean {
        return this._hasHero;
    }

    public get meatDeposit(): DepositPoint | null {
        return this._meatDeposit;
    }

    /** 生肉放置区根节点（Deposit_RawMeat，不是 HeroPurchase） */
    public get meatDepositRoot(): Node | null {
        return this._meatDeposit?.node ?? this.meatDepositPoint?.node ?? null;
    }

    protected onLoad(): void {
        this._autoBind();
        this._applyBuiltNodes(this._built);
        if (this.heroPurchaseUI) {
            this.heroPurchaseUI.active = false;
            this._heroPurchaseTrigger()?.setUnlocked(false);
        }
        if (this.helperPurchaseUI) {
            this.helperPurchaseUI.active = false;
            this._helperPurchaseTrigger()?.setUnlocked(false);
        }
        EventBus.on(GameEvent.CMD_BUILD_TOWER, this._onBuildCmd, this);
        EventBus.on(GameEvent.TOWER_BUILT, this._onBuiltEvent, this);
        EventBus.on(GameEvent.SHOP_PURCHASE_SUCCESS, this._onShopSuccess, this);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.CMD_BUILD_TOWER, this._onBuildCmd, this);
        EventBus.off(GameEvent.TOWER_BUILT, this._onBuiltEvent, this);
        EventBus.off(GameEvent.SHOP_PURCHASE_SUCCESS, this._onShopSuccess, this);
    }

    private _autoBind(): void {
        if (!this.visual) {
            this.visual = this.node.getChildByName('Visual');
        }
        if (!this.mountTrigger) {
            this.mountTrigger = this.node.getChildByName('MountTrigger');
        }
        if (!this.groundPoint) {
            this.groundPoint = this.node.getChildByName('GroundPoint');
        }
        if (!this.heroStandPoint) {
            this.heroStandPoint =
                this.node.getChildByName('StandPoint') ??
                this.node.getChildByName('HeroStand') ??
                null;
        }
        if (!this.heroPurchaseUI) {
            this.heroPurchaseUI = this.node.getChildByName('HeroPurchase');
        }
        if (!this.meatDepositPoint) {
            const local =
                this.node.getChildByName('Deposit_RawMeat') ??
                this.node.getChildByName('DepositRawMeat');
            this.meatDepositPoint = local?.getComponent(DepositPoint) ?? null;
        }
        // 若误绑到 uiRoot，提升到带 PurchaseTrigger 的节点
        const heroTrig = this._heroPurchaseTrigger();
        if (heroTrig) {
            this.heroPurchaseUI = heroTrig.node;
        }
        if (!this.buildTrigger) {
            const buildNode = this.node.getChildByName('BuildTrigger');
            this.buildTrigger = buildNode?.getComponent(PurchaseTrigger) ?? null;
        }
        if (!this.helperPurchaseUI && !this.isExpandTower) {
            const city = this.node.parent?.parent;
            const purchases = city?.getChildByName('Purchases');
            this.helperPurchaseUI = purchases?.getChildByName('BuyHelper') ?? null;
        }
        // 若误绑到 uiRoot，提升到带 PurchaseTrigger 的 BuyHelper 节点
        const helperTrig = this._helperPurchaseTrigger();
        if (helperTrig) {
            this.helperPurchaseUI = helperTrig.node;
        }
        if (!this.meatDepositId) {
            this.meatDepositId = `${this.towerId}_meat_deposit`;
        }
    }

    /** 箭塔建成后才显示：Visual / GroundPoint / MountTrigger */
    private _applyBuiltNodes(built: boolean): void {
        if (this.visual) {
            this.visual.active = built;
        }
        if (this.groundPoint) {
            this.groundPoint.active = built;
        }
        if (this.mountTrigger) {
            this.mountTrigger.active = built;
        }
    }

    private _heroPurchaseTrigger(): PurchaseTrigger | null {
        if (!this.heroPurchaseUI) {
            return null;
        }
        return (
            this.heroPurchaseUI.getComponent(PurchaseTrigger) ??
            this.heroPurchaseUI.getComponentInChildren(PurchaseTrigger) ??
            this.heroPurchaseUI.parent?.getComponent(PurchaseTrigger) ??
            null
        );
    }

    private _helperPurchaseTrigger(): PurchaseTrigger | null {
        if (!this.helperPurchaseUI) {
            return null;
        }
        return (
            this.helperPurchaseUI.getComponent(PurchaseTrigger) ??
            this.helperPurchaseUI.getComponentInChildren(PurchaseTrigger) ??
            this.helperPurchaseUI.parent?.getComponent(PurchaseTrigger) ??
            null
        );
    }

    private _onBuildCmd(data: { towerId: string; isExpand?: boolean }): void {
        if (data.towerId !== this.towerId) {
            return;
        }
        // ShopSystem 发出的拓展塔建造必须以 isExpand 为准（场景里西塔可能漏勾 isExpandTower）
        if (data.isExpand) {
            this.isExpandTower = true;
        }
        this.build();
    }

    public build(): void {
        if (this._built) {
            return;
        }
        this._built = true;
        this._applyBuiltNodes(true);
        if (this.buildTrigger) {
            this.buildTrigger.node.active = false;
        }
        EventBus.emit(GameEvent.TOWER_BUILT, {
            towerId: this.towerId,
            isExpand: this.isExpandTower,
        });
        if (this.isExpandTower) {
            EventBus.emit(GameEvent.GAME_CLEARED);
        }
    }

    private _onBuiltEvent(data: { towerId: string; isExpand?: boolean }): void {
        if (data.towerId !== this.towerId) {
            return;
        }
        this._built = true;
        this._applyBuiltNodes(true);
        if (this.buildTrigger) {
            this.buildTrigger.node.active = false;
        }
        if (!data.isExpand && !this.isExpandTower) {
            this.unlockHelperPurchase();
        }
    }

    private _onShopSuccess(data: ShopPurchasePayload): void {
        if (this.isExpandTower || !this._built) {
            return;
        }
        if (data.itemType === ShopItemType.MeatHelper) {
            this.unlockHeroPurchase();
        }
    }

    /** 箭塔建成：只解锁帮手购买点（英雄购买等帮手买完后） */
    public unlockHelperPurchase(): void {
        const pt = this._helperPurchaseTrigger();
        const root = pt?.node ?? this.helperPurchaseUI;
        if (!root) {
            return;
        }
        this.helperPurchaseUI = root;
        root.active = true;
        if (pt?.uiRoot) {
            pt.uiRoot.active = true;
        }
        pt?.setUnlocked(true);
    }

    /** 第三阶段：帮手解锁后开放英雄购买 */
    public unlockHeroPurchase(): void {
        if (this._meatDeposit) {
            return;
        }
        const trigger = this._heroPurchaseTrigger();
        const root = trigger?.node ?? this.heroPurchaseUI;
        if (!root) {
            return;
        }
        this.heroPurchaseUI = root;
        root.active = true;
        if (trigger?.uiRoot) {
            trigger.uiRoot.active = true;
        }
        trigger?.setUnlocked(true);
    }

    /**
     * 英雄购买完成：隐藏 HeroPurchase，在其位置启用/生成独立 Deposit_RawMeat。
     */
    public convertHeroPurchaseToMeatDeposit(): string {
        this._hasHero = true;
        const depositId = this.meatDepositId || `${this.towerId}_meat_deposit`;
        if (this._meatDeposit) {
            return this._meatDeposit.depositId || depositId;
        }

        const purchase = this._heroPurchaseTrigger()?.node ?? this.heroPurchaseUI;
        const worldPos = purchase
            ? purchase.worldPosition.clone()
            : this.node.worldPosition.clone();

        // 只关购买 UI，不把 HeroPurchase 改成 DepositPoint
        this._hideHeroPurchase();

        const dep = this._resolveOrCreateMeatDeposit(depositId, worldPos);
        this._meatDeposit = dep;
        this.meatDepositPoint = dep;
        return dep.depositId || depositId;
    }

    private _hideHeroPurchase(): void {
        const trigger = this._heroPurchaseTrigger();
        const root = trigger?.node ?? this.heroPurchaseUI;
        if (trigger) {
            trigger.setUnlocked(false);
            trigger.enabled = false;
            if (trigger.uiRoot) {
                trigger.uiRoot.active = false;
            }
        }
        if (root) {
            root.active = false;
        }
    }

    private _resolveOrCreateMeatDeposit(depositId: string, worldPos: { x: number; y: number; z: number }): DepositPoint {
        let dep = this.meatDepositPoint;
        if (!dep) {
            const local =
                this.node.getChildByName('Deposit_RawMeat') ??
                this.node.getChildByName('DepositRawMeat');
            dep = local?.getComponent(DepositPoint) ?? null;
        }

        // 全局模板 deposit_raw 只作克隆源，不直接挪给某一塔
        if (dep && this._isSharedMeatTemplate(dep)) {
            this.meatDepositTemplate = this.meatDepositTemplate ?? dep.node;
            dep = null;
        }

        if (!dep) {
            dep = this._cloneMeatDepositFromTemplate(depositId);
        }

        if (!dep) {
            dep = this._createFallbackMeatDeposit(depositId);
        }

        dep.depositId = depositId;
        dep.depositType = DepositType.RawMeat;
        dep.boundStallId = this.boundStallId || 'stall_raw';

        const eco = this.node.scene?.getComponentInChildren(ResourceEconomySystem);
        if (eco?.rawMeatPrefab && !dep.resourcePrefab) {
            dep.resourcePrefab = eco.rawMeatPrefab;
        }
        if (eco && eco.deposits.indexOf(dep) < 0) {
            eco.deposits.push(dep);
        }

        dep.node.active = true;
        dep.node.setWorldPosition(worldPos.x, worldPos.y, 0);
        return dep;
    }

    private _isSharedMeatTemplate(dep: DepositPoint): boolean {
        if (dep.node.parent === this.node) {
            return false;
        }
        return (
            dep.depositId === 'deposit_raw' ||
            dep.node.name === 'Deposit_RawMeat' ||
            dep.node.name === 'DepositRawMeat'
        );
    }

    /** 克隆场景 Deposit_RawMeat（含 6 槽位），作为本塔专用储肉点 */
    private _cloneMeatDepositFromTemplate(depositId: string): DepositPoint | null {
        let template = this.meatDepositTemplate;
        if (!template) {
            const all = this.node.scene?.getComponentsInChildren(DepositPoint, true) ?? [];
            const raw = all.find(
                (d) =>
                    d.node.name === 'Deposit_RawMeat' ||
                    d.node.name === 'DepositRawMeat' ||
                    d.depositId === 'deposit_raw',
            );
            template = raw?.node ?? null;
        }
        if (!template) {
            return null;
        }

        const depositsRoot = template.parent;
        const clone = instantiate(template);
        clone.name = `Deposit_RawMeat_${this.towerId}`;
        clone.parent = depositsRoot ?? this.node;
        clone.active = true;

        const dep = clone.getComponent(DepositPoint) ?? clone.getComponentInChildren(DepositPoint);
        if (!dep) {
            clone.destroy();
            return null;
        }
        dep.depositId = depositId;
        return dep;
    }

    /** 无模板时兜底：生成带 6 槽的 Deposit_RawMeat */
    private _createFallbackMeatDeposit(depositId: string): DepositPoint {
        let parent: Node = this.node;
        const city = this.node.parent?.parent;
        const deposits = city?.getChildByName('Deposits');
        if (deposits) {
            parent = deposits;
        }

        const root = new Node(`Deposit_RawMeat_${this.towerId}`);
        root.layer = this.node.layer;
        root.parent = parent;

        const slots: Node[] = [];
        for (let i = 0; i < 6; i++) {
            const s = new Node(`pos_${i}`);
            s.layer = root.layer;
            s.parent = root;
            s.setPosition((i % 3) * 24 - 24, Math.floor(i / 3) * 20, 0);
            slots.push(s);
        }

        const dep = root.addComponent(DepositPoint);
        dep.depositId = depositId;
        dep.depositType = DepositType.RawMeat;
        dep.boundStallId = this.boundStallId || 'stall_raw';
        dep.slots = slots;
        return dep;
    }
}
