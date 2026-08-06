import {
    _decorator,
    Component,
    Node,
    Prefab,
    instantiate,
    Vec3,
    Quat,
} from 'cc';
import { ResourceType, ShopItemType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { PlayerController } from '../player/PlayerController';
import { PlayerCarryStack } from '../player/PlayerCarryStack';
import { ResourceEconomySystem } from '../economy/ResourceEconomySystem';
import { DepositPoint } from '../economy/DepositPoint';
import { PurchaseTrigger } from '../shop/PurchaseTrigger';
import { EnemySpawner } from '../combat/EnemySpawner';
import { SortingOrder2D } from '../core/SortingOrder2D';

const { ccclass, property } = _decorator;

/**
 * 引导连线：按距离在玩家→目的地之间铺 guideWire，目的地放 bigArrow。
 * 目的地优先级见 _resolveDestination。
 */
@ccclass('GuidePathArrow')
export class GuidePathArrow extends Component {
    @property({ type: Prefab, tooltip: '小箭头 prefab：guideWire' })
    public guideWirePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '目的地大箭头 prefab：bigArrow' })
    public bigArrowPrefab: Prefab | null = null;

    @property({ type: PlayerController, tooltip: '玩家（空则场景内查找）' })
    public player: PlayerController | null = null;

    @property({ type: ResourceEconomySystem, tooltip: '经济系统（读金币；空则查找）' })
    public economy: ResourceEconomySystem | null = null;

    @property({ type: EnemySpawner, tooltip: '刷怪器（指引敌人；空则查找）' })
    public spawner: EnemySpawner | null = null;

    @property({ type: Node, tooltip: '箭头挂载父节点（空则用玩家父节点）' })
    public worldRoot: Node | null = null;

    @property({ tooltip: '小箭头间距（世界单位，越小越密）' })
    public wireSpacing: number = GameConstants.GUIDE_WIRE_SPACING;

    @property({ tooltip: '小箭头数量上限' })
    public maxWires: number = 40;

    @property({ tooltip: '路径起点留白（不贴玩家）' })
    public wireStartPad: number = GameConstants.GUIDE_WIRE_START_PAD;

    @property({ tooltip: '路径终点留白（不贴 bigArrow）' })
    public wireEndPad: number = GameConstants.GUIDE_WIRE_END_PAD;

    @property({ tooltip: '距目的地小于此值时隐藏连线（仍可保留大箭头）' })
    public hideWireDistance: number = 50;

    @property({ tooltip: 'guideWire 默认朝向：贴图尖端相对 +X 的补偿角（度）' })
    public wireAngleOffset: number = 0;

    @property({ tooltip: '靠近目的地后是否也隐藏 bigArrow' })
    public hideBigArrowWhenNear: boolean = true;

    // —— 可选显式绑定；空则按名称 / ShopItemType 自动找 ——
    @property({ type: Node, tooltip: 'Tower_South/BuildTrigger' })
    public buildTrigger: Node | null = null;

    @property({ type: Node, tooltip: 'BuyHelper' })
    public buyHelper: Node | null = null;

    @property({ type: Node, tooltip: 'BuyCookedStall' })
    public buyCookedStall: Node | null = null;

    @property({ type: Node, tooltip: 'pref_ExpandWestKit/BuyExpand' })
    public buyExpand: Node | null = null;

    @property({ type: Node, tooltip: 'ExpandWest/.../BuyLumberjack' })
    public buyLumberjack: Node | null = null;

    @property({ type: DepositPoint, tooltip: 'Deposit_Coin' })
    public depositCoin: DepositPoint | null = null;

    @property({ type: Node, tooltip: '生肉摊 InteractZone' })
    public interactZone: Node | null = null;

    private _wires: Node[] = [];
    private _bigArrow: Node | null = null;
    private _tmpFrom = new Vec3();
    private _tmpTo = new Vec3();
    private _tmpDir = new Vec3();
    private _quat = new Quat();

    protected onLoad(): void {
        this._resolveRefs();
    }

    protected update(): void {
        if (!this.guideWirePrefab || !this.bigArrowPrefab) {
            return;
        }
        if (!this.player?.isValid) {
            this._resolveRefs();
            if (!this.player?.isValid) {
                this._setVisible(false);
                return;
            }
        }
        const dest = this._resolveDestination();
        if (!dest?.isValid) {
            this._setVisible(false);
            return;
        }
        this._layoutPath(dest);
    }

    protected onDestroy(): void {
        this._clearWires();
        if (this._bigArrow?.isValid) {
            this._bigArrow.destroy();
        }
        this._bigArrow = null;
    }

    private _resolveRefs(): void {
        const scene = this.node.scene;
        if (!scene) {
            return;
        }
        if (!this.player) {
            this.player = scene.getComponentInChildren(PlayerController);
        }
        if (!this.economy) {
            this.economy = scene.getComponentInChildren(ResourceEconomySystem);
        }
        if (!this.spawner) {
            this.spawner = scene.getComponentInChildren(EnemySpawner);
        }
        if (!this.worldRoot && this.player) {
            this.worldRoot = this.player.node.parent;
        }
        if (!this.buildTrigger) {
            const tower = this._findByName(scene, 'Tower_South');
            this.buildTrigger = tower?.getChildByName('BuildTrigger') ?? null;
        }
        if (!this.buyHelper) {
            this.buyHelper = this._findByName(scene, 'BuyHelper');
        }
        if (!this.buyCookedStall) {
            this.buyCookedStall =
                this._findByName(scene, 'BuyCookedStall') ??
                this._findPurchaseNode(ShopItemType.CookedMeatStall);
        }
        if (!this.buyExpand) {
            const kit = this._findByName(scene, 'pref_ExpandWestKit');
            this.buyExpand =
                kit?.getChildByName('BuyExpand') ??
                this._findByName(scene, 'BuyExpand');
        }
        if (!this.buyLumberjack) {
            const west = this._findByName(scene, 'ExpandWest');
            this.buyLumberjack =
                this._findByName(west ?? scene, 'BuyLumberjack') ??
                this._findPurchaseNode(ShopItemType.Lumberjack);
        }
        if (!this.depositCoin) {
            const n = this._findByName(scene, 'Deposit_Coin');
            this.depositCoin = n?.getComponent(DepositPoint) ?? null;
            if (!this.depositCoin) {
                const all = scene.getComponentsInChildren(DepositPoint);
                this.depositCoin =
                    all.find((d) => d.resourceType === ResourceType.Coin) ?? null;
            }
        }
        if (!this.interactZone) {
            const stall = this._findByName(scene, 'Stall_RawMeat');
            this.interactZone = stall?.getChildByName('InteractZone') ?? null;
        }
    }

    /**
     * 金币够付当前购买链目标 → 指向该 Purchase；
     * 否则：Deposit 有币 → 拾币；有肉 → InteractZone；否则 → 任意敌人。
     */
    private _resolveDestination(): Node | null {
        const purchase = this._nextPurchaseTarget();
        const coin = this.economy?.coin ?? 0;
        if (purchase && coin >= purchase.remainingPrice) {
            return purchase.uiRoot?.activeInHierarchy
                ? purchase.uiRoot
                : purchase.node;
        }
        return this._resolveFarmDestination();
    }

    private _resolveFarmDestination(): Node | null {
        if (this.depositCoin && this.depositCoin.stock > 0) {
            return this.depositCoin.node;
        }
        if (this._playerHasMeat()) {
            return this.interactZone;
        }
        const from = this.player?.node.worldPosition;
        if (from && this.spawner) {
            const enemy = this.spawner.findNearest(from);
            if (enemy?.alive) {
                return enemy.node;
            }
        }
        return null;
    }

    private _playerHasMeat(): boolean {
        const carry =
            this.player?.carryStack ??
            this.player?.node.getComponent(PlayerCarryStack) ??
            this.node.scene?.getComponentInChildren(PlayerCarryStack) ??
            null;
        if (!carry) {
            return false;
        }
        return (
            carry.getCount(ResourceType.RawMeat) > 0 ||
            carry.getCount(ResourceType.CookedMeat) > 0
        );
    }

    /**
     * 购买链（前一步完成后才会解锁下一步）：
     * BuildTrigger → BuyHelper → BuyCookedStall → BuyExpand → BuyLumberjack
     */
    private _nextPurchaseTarget(): PurchaseTrigger | null {
        const chain: (Node | null)[] = [
            this.buildTrigger,
            this.buyHelper,
            this.buyCookedStall,
            this.buyExpand,
            this.buyLumberjack,
        ];
        for (const n of chain) {
            if (!n?.isValid) {
                continue;
            }
            const pt = n.getComponent(PurchaseTrigger) ?? n.getComponentInChildren(PurchaseTrigger);
            if (!pt || pt.purchased) {
                continue;
            }
            if (!pt.unlocked || !pt.node.activeInHierarchy) {
                continue;
            }
            return pt;
        }
        return null;
    }

    private _layoutPath(dest: Node): void {
        const parent = this.worldRoot ?? this.player!.node.parent;
        if (!parent) {
            return;
        }
        this.player!.node.getWorldPosition(this._tmpFrom);
        dest.getWorldPosition(this._tmpTo);
        this._tmpFrom.z = 0;
        this._tmpTo.z = 0;

        Vec3.subtract(this._tmpDir, this._tmpTo, this._tmpFrom);
        const dist = Math.sqrt(this._tmpDir.x * this._tmpDir.x + this._tmpDir.y * this._tmpDir.y);
        const near = dist <= this.hideWireDistance;

        // bigArrow
        if (!this._bigArrow?.isValid) {
            this._bigArrow = instantiate(this.bigArrowPrefab!);
            this._bigArrow.parent = parent;
            this._ensureSort(this._bigArrow);
        }
        this._bigArrow.active = !(this.hideBigArrowWhenNear && near);
        if (this._bigArrow.active) {
            this._bigArrow.setWorldPosition(this._tmpTo.x, this._tmpTo.y, 0);
        }

        if (near || dist < 1) {
            this._resizeWires(0);
            return;
        }

        const spacing = Math.max(16, this.wireSpacing);
        const startPad = Math.max(0, this.wireStartPad);
        const endPad = Math.max(0, this.wireEndPad);
        const nx = this._tmpDir.x / dist;
        const ny = this._tmpDir.y / dist;

        const positions: number[] = [];
        for (let t = startPad + spacing; t < dist - endPad; t += spacing) {
            positions.push(t);
            if (positions.length >= this.maxWires) {
                break;
            }
        }
        // 距离够长却一个都没有时，至少补一颗在路径中段
        if (positions.length === 0 && dist > startPad + endPad + spacing) {
            positions.push((dist - startPad - endPad) * 0.5 + startPad);
        }

        const n = positions.length;
        this._resizeWires(n);

        const ang =
            (Math.atan2(this._tmpDir.y, this._tmpDir.x) * 180) / Math.PI + this.wireAngleOffset;
        Quat.fromEuler(this._quat, 0, 0, ang);

        for (let i = 0; i < n; i++) {
            const t = positions[i];
            const wire = this._wires[i];
            wire.active = true;
            wire.setWorldPosition(this._tmpFrom.x + nx * t, this._tmpFrom.y + ny * t, 0);
            wire.setWorldRotation(this._quat);
        }
    }

    private _resizeWires(count: number): void {
        const parent = this.worldRoot ?? this.player?.node.parent;
        while (this._wires.length < count && parent && this.guideWirePrefab) {
            const w = instantiate(this.guideWirePrefab);
            w.parent = parent;
            this._ensureSort(w);
            this._wires.push(w);
        }
        for (let i = 0; i < this._wires.length; i++) {
            const w = this._wires[i];
            if (!w?.isValid) {
                continue;
            }
            w.active = i < count;
        }
    }

    private _clearWires(): void {
        for (const w of this._wires) {
            if (w?.isValid) {
                w.destroy();
            }
        }
        this._wires.length = 0;
    }

    private _setVisible(on: boolean): void {
        if (!on) {
            this._resizeWires(0);
            if (this._bigArrow?.isValid) {
                this._bigArrow.active = false;
            }
        }
    }

    private _ensureSort(n: Node): void {
        if (!n.getComponent(SortingOrder2D) && !n.getComponentInChildren(SortingOrder2D)) {
            const s = n.addComponent(SortingOrder2D);
            s.orderOffset = 50;
        }
    }

    private _findByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this._findByName(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }

    private _findPurchaseNode(type: ShopItemType): Node | null {
        const scene = this.node.scene;
        if (!scene) {
            return null;
        }
        const list = scene.getComponentsInChildren(PurchaseTrigger);
        for (const p of list) {
            if (p.itemType === type) {
                return p.node;
            }
        }
        return null;
    }
}
