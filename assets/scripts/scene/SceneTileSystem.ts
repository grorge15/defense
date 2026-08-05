import { _decorator, Component, Node } from 'cc';
import { ExpandSide } from '../core/Enums';
import { EventBus, GameEvent } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { TreeEntity } from './TreeEntity';

const { ccclass, property } = _decorator;

/**
 * 场景地块管理系统：解锁状态、树木刷新与重生。
 * 禁止：资源产出、NPC 控制（砍伐事件通知经济系统）。
 */
@ccclass('SceneTileSystem')
export class SceneTileSystem extends Component {
    @property({ type: Node, tooltip: '东侧拓展区域根节点' })
    public eastArea: Node | null = null;

    @property({ type: Node, tooltip: '西侧拓展区域根节点' })
    public westArea: Node | null = null;

    @property({ type: [TreeEntity], tooltip: '场景树木（共 6 棵）' })
    public trees: TreeEntity[] = [];

    @property({ tooltip: '同时被砍倒后重生数量' })
    public regrowPair: number = GameConstants.TREE_REGROW_PAIR;

    private _eastUnlocked: boolean = false;
    private _westUnlocked: boolean = false;
    private _fallenIds: string[] = [];

    protected onLoad(): void {
        this._autoCollectTrees();
        EventBus.on(GameEvent.CMD_UNLOCK_EXPAND, this._onUnlock, this);
        EventBus.on(GameEvent.TREE_CHOPPED, this._onTreeChopped, this);
        if (this.eastArea) {
            this.eastArea.active = false;
        }
        if (this.westArea) {
            this.westArea.active = false;
        }
    }

    /** 若 Inspector 未绑 trees，从东/西拓展区自动收集 TreeEntity */
    private _autoCollectTrees(): void {
        if (this.trees.length > 0) {
            return;
        }
        const collected: TreeEntity[] = [];
        const pushFrom = (root: Node | null) => {
            if (!root) {
                return;
            }
            for (const t of root.getComponentsInChildren(TreeEntity)) {
                if (collected.indexOf(t) < 0) {
                    collected.push(t);
                }
            }
        };
        pushFrom(this.eastArea);
        pushFrom(this.westArea);
        this.trees = collected;
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.CMD_UNLOCK_EXPAND, this._onUnlock, this);
        EventBus.off(GameEvent.TREE_CHOPPED, this._onTreeChopped, this);
    }

    public isUnlocked(side: ExpandSide): boolean {
        return side === ExpandSide.East ? this._eastUnlocked : this._westUnlocked;
    }

    private _onUnlock(data: { side: ExpandSide }): void {
        if (data.side === ExpandSide.East) {
            this._eastUnlocked = true;
            if (this.eastArea) {
                this.eastArea.active = true;
            }
        } else {
            this._westUnlocked = true;
            if (this.westArea) {
                this.westArea.active = true;
            }
        }
        EventBus.emit(GameEvent.EXPAND_UNLOCKED, data);
    }

    private _onTreeChopped(data: { treeId: string }): void {
        const tree = this.trees.find((t) => t.treeId === data.treeId);
        if (!tree || tree.canChop) {
            return;
        }
        // 已耗尽
        if (this._fallenIds.indexOf(data.treeId) < 0) {
            this._fallenIds.push(data.treeId);
        }
        if (this._fallenIds.length >= this.regrowPair) {
            const toGrow = this._fallenIds.splice(0, this.regrowPair);
            for (const id of toGrow) {
                const t = this.trees.find((x) => x.treeId === id);
                t?.regrow();
            }
        }
    }
}
