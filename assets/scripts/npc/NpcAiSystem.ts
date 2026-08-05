import { _decorator, Component, Node, Prefab, instantiate } from 'cc';
import { EventBus, GameEvent, ShopPurchasePayload } from '../core/GameEvent';
import { ExpandSide, StallType } from '../core/Enums';
import { HelperNpc } from './HelperNpc';
import { LumberjackNpc } from './LumberjackNpc';
import { Stall } from '../economy/Stall';
import { DepositPoint } from '../economy/DepositPoint';
import { TreeEntity } from '../scene/TreeEntity';

const { ccclass, property } = _decorator;

/**
 * NPC AI 系统：帮手 / 伐木工生命周期。
 * 禁止：直接移动资源实体、修改摊位库存。
 */
@ccclass('NpcAiSystem')
export class NpcAiSystem extends Component {
    @property({ type: Prefab, tooltip: '帮手预制体' })
    public helperPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '伐木工预制体' })
    public lumberjackPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: 'NPC 父节点' })
    public npcRoot: Node | null = null;

    @property({ type: Stall, tooltip: '默认生肉摊位（帮手绑定）' })
    public defaultMeatStall: Stall | null = null;

    @property({ type: DepositPoint, tooltip: '默认生肉放置点' })
    public defaultMeatDeposit: DepositPoint | null = null;

    @property({ type: Node, tooltip: '帮手出生点（空则用摊位 InteractZone 世界坐标）' })
    public helperSpawnPoint: Node | null = null;

    @property({ type: [TreeEntity], tooltip: '伐木工可用树木' })
    public trees: TreeEntity[] = [];

    private _helpers: HelperNpc[] = [];
    private _lumberjacks: LumberjackNpc[] = [];

    protected onLoad(): void {
        EventBus.on(GameEvent.CMD_CREATE_HELPER, this._onCreateHelper, this);
        EventBus.on(GameEvent.CMD_CREATE_LUMBERJACK, this._onCreateLumberjack, this);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.CMD_CREATE_HELPER, this._onCreateHelper, this);
        EventBus.off(GameEvent.CMD_CREATE_LUMBERJACK, this._onCreateLumberjack, this);
    }

    private _onCreateHelper(data: { stallId?: string }): void {
        const stall = this._resolveStall(data.stallId);
        const deposit = this._resolveDeposit(stall);

        if (!this.helperPrefab) {
            const pre = this.node.getChildByName('Helper_Meat');
            if (pre) {
                const h = pre.getComponent(HelperNpc);
                if (h) {
                    h.bindWorkplace(stall, deposit);
                    this._helpers.push(h);
                }
                this._placeHelperNode(pre, stall);
                pre.active = true;
            }
            return;
        }
        const node = instantiate(this.helperPrefab);
        node.parent = this.npcRoot ?? this.node;
        const helper = node.getComponent(HelperNpc);
        if (helper) {
            helper.npcId = `helper_${data.stallId ?? 'stall'}_${this._helpers.length}`;
            helper.bindWorkplace(stall, deposit);
            this._helpers.push(helper);
        }
        this._placeHelperNode(node, stall);
        // 确保摊位进入帮手卖货模式（即使 Helper.start 尚未跑）
        stall?.setHelperActive(true);
    }

    /** 世界坐标：优先 helperSpawnPoint，否则摊位 InteractZone / 摊位节点 */
    private _placeHelperNode(node: Node, stall: Stall | null): void {
        const anchor =
            this.helperSpawnPoint ??
            stall?.interactZone ??
            stall?.node.getChildByName('InteractZone') ??
            stall?.node ??
            null;
        if (!anchor) {
            console.warn('[NpcAiSystem] 帮手无出生锚点：请绑 helperSpawnPoint 或 defaultMeatStall');
            return;
        }
        const wp = anchor.worldPosition;
        node.setWorldPosition(wp.x, wp.y, 0);
    }

    private _resolveStall(stallId?: string): Stall | null {
        const id = stallId ?? 'stall_raw';
        const stalls = this.node.scene?.getComponentsInChildren(Stall, true) ?? [];
        const found = stalls.find((s) => s.stallId === id) ?? null;
        if (found) {
            return found;
        }
        if (id === 'stall_raw' || !stallId) {
            return this.defaultMeatStall;
        }
        return null;
    }

    private _resolveDeposit(stall: Stall | null): DepositPoint | null {
        if (stall?.boundDeposit) {
            return stall.boundDeposit;
        }
        if (stall?.stallId === 'stall_raw' || stall?.stallType === StallType.RawMeat) {
            if (this.defaultMeatDeposit) {
                return this.defaultMeatDeposit;
            }
        }
        const deps = this.node.scene?.getComponentsInChildren(DepositPoint, true) ?? [];
        const stallId = stall?.stallId ?? '';
        const byStall = deps.find((d) => d.boundStallId === stallId);
        if (byStall) {
            return byStall;
        }
        if (stall?.stallType === StallType.Wood) {
            return (
                deps.find((d) => d.depositId === 'deposit_wood' || d.depositId.startsWith('deposit_wood')) ??
                null
            );
        }
        return (
            deps.find((d) => d.depositId === 'deposit_raw' || d.boundStallId === 'stall_raw') ?? null
        );
    }

    private _onCreateLumberjack(data: { side?: ExpandSide }): void {
        if (!this.lumberjackPrefab) {
            return;
        }
        const node = instantiate(this.lumberjackPrefab);
        node.parent = this.npcRoot ?? this.node;
        const lj = node.getComponent(LumberjackNpc);
        if (lj) {
            lj.trees = this._resolveTrees();
            this._lumberjacks.push(lj);
        }
        // 出生在对应侧 BuyLumberjack / 区域中心附近
        this._placeLumberjack(node, data.side);
    }

    private _resolveTrees(): TreeEntity[] {
        if (this.trees.length > 0) {
            return this.trees;
        }
        const fromScene = this.node.scene?.getComponentsInChildren(TreeEntity, true) ?? [];
        return fromScene.filter((t) => t && t.isValid);
    }

    private _placeLumberjack(node: Node, side?: ExpandSide): void {
        const scene = this.node.scene;
        if (!scene) {
            return;
        }
        const areaName = side === ExpandSide.West ? 'ExpandWest' : 'ExpandEast';
        const area =
            scene.getChildByName('GameRoot')?.getChildByName('World')?.getChildByName(areaName) ??
            null;
        const anchor =
            area?.getChildByName('BuyLumberjack') ??
            area?.getChildByName('Trees') ??
            area ??
            null;
        if (!anchor) {
            return;
        }
        const wp = anchor.worldPosition;
        node.setWorldPosition(wp.x, wp.y, 0);
    }
}
