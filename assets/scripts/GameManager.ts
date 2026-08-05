import { _decorator, Component } from 'cc';
import { EventBus, GameEvent } from './core/GameEvent';
import { GameConstants } from './core/GameConstants';
import { DefenseCombatSystem } from './combat/DefenseCombatSystem';
import { ResourceEconomySystem } from './economy/ResourceEconomySystem';
import { NpcAiSystem } from './npc/NpcAiSystem';
import { ShopSystem } from './shop/ShopSystem';
import { SceneTileSystem } from './scene/SceneTileSystem';
import { PlayerController } from './player/PlayerController';
import { TutorialGuide } from './ui/TutorialGuide';

const { ccclass, property } = _decorator;

/**
 * 游戏总控：挂接六大系统，开局推送初始金币，响应通关。
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: PlayerController, tooltip: '玩家控制系统' })
    public player: PlayerController | null = null;

    @property({ type: DefenseCombatSystem, tooltip: '防守战斗系统' })
    public combat: DefenseCombatSystem | null = null;

    @property({ type: ResourceEconomySystem, tooltip: '资源经济系统' })
    public economy: ResourceEconomySystem | null = null;

    @property({ type: NpcAiSystem, tooltip: 'NPC AI 系统' })
    public npcAi: NpcAiSystem | null = null;

    @property({ type: ShopSystem, tooltip: '商店系统' })
    public shop: ShopSystem | null = null;

    @property({ type: SceneTileSystem, tooltip: '场景地块系统' })
    public sceneTiles: SceneTileSystem | null = null;

    @property({ type: TutorialGuide, tooltip: '新手引导' })
    public guide: TutorialGuide | null = null;

    protected onLoad(): void {
        EventBus.on(GameEvent.GAME_CLEARED, this._onCleared, this);
    }

    protected start(): void {
        // 初始金币由经济系统持有并广播
        EventBus.emit(GameEvent.COIN_CHANGED, {
            coin: this.economy?.coin ?? GameConstants.PLAYER_INIT_COIN,
            delta: 0,
        });
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.GAME_CLEARED, this._onCleared, this);
        EventBus.clear();
    }

    private _onCleared(): void {
        console.log('[GameManager] 拓展箭塔建成，本局结束');
        // 引导未绑 tipLabel 时仍尽量弹出通关文案
        if (this.guide) {
            return;
        }
        const guide = this.node.scene?.getComponentInChildren(TutorialGuide) ?? null;
        if (guide) {
            this.guide = guide;
        }
    }
}
