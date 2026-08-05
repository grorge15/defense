import { _decorator, Component, Node, Label } from 'cc';
import { GuidePhase } from '../core/Enums';
import { EventBus, GameEvent, CoinChangedPayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';

const { ccclass, property } = _decorator;

/**
 * 新手引导阶段推进 + 通关文案提示。
 */
@ccclass('TutorialGuide')
export class TutorialGuide extends Component {
    @property({ tooltip: '引导提示 Label' })
    public tipLabel: Label | null = null;

    @property({ tooltip: '引导箭头/高亮根节点（可选）' })
    public pointerRoot: Node | null = null;

    @property({
        type: Node,
        tooltip: '通关面板根节点（可选；建成拓展塔后 active=true）',
    })
    public clearPanel: Node | null = null;

    @property({ type: Label, tooltip: '通关文案 Label（空则用 tipLabel）' })
    public clearLabel: Label | null = null;

    private _phase: GuidePhase = GuidePhase.MoveHint;
    private _coin: number = GameConstants.PLAYER_INIT_COIN;
    private _helperGuideShown: boolean = false;

    public get phase(): GuidePhase {
        return this._phase;
    }

    protected onLoad(): void {
        this._ensureTipLabel();
        if (this.clearPanel) {
            this.clearPanel.active = false;
        }
        EventBus.on(GameEvent.PLAYER_FIRST_MOVE, this._onFirstMove, this);
        EventBus.on(GameEvent.TOWER_BUILT, this._onTowerBuilt, this);
        EventBus.on(GameEvent.COIN_CHANGED, this._onCoin, this);
        EventBus.on(GameEvent.SHOP_PURCHASE_SUCCESS, this._onPurchase, this);
        EventBus.on(GameEvent.HERO_CREATED, this._onHero, this);
        EventBus.on(GameEvent.GAME_CLEARED, this._onClear, this);
        this._setPhase(GuidePhase.MoveHint, '滑动摇杆移动角色');
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.PLAYER_FIRST_MOVE, this._onFirstMove, this);
        EventBus.off(GameEvent.TOWER_BUILT, this._onTowerBuilt, this);
        EventBus.off(GameEvent.COIN_CHANGED, this._onCoin, this);
        EventBus.off(GameEvent.SHOP_PURCHASE_SUCCESS, this._onPurchase, this);
        EventBus.off(GameEvent.HERO_CREATED, this._onHero, this);
        EventBus.off(GameEvent.GAME_CLEARED, this._onClear, this);
    }

    private _ensureTipLabel(): void {
        if (this.tipLabel?.isValid) {
            return;
        }
        const tipNode =
            this.node.getChildByName('TipLabel') ??
            this.node.getChildByName('Tip') ??
            this.node.getChildByName('GuideTip');
        this.tipLabel =
            tipNode?.getComponent(Label) ??
            this.getComponent(Label) ??
            this.getComponentInChildren(Label) ??
            null;
    }

    private _setPhase(phase: GuidePhase, tip: string): void {
        this._phase = phase;
        this._ensureTipLabel();
        if (this.tipLabel) {
            this.tipLabel.node.active = true;
            this.tipLabel.string = tip;
        }
        EventBus.emit(GameEvent.GUIDE_PHASE_CHANGED, { phase });
    }

    private _onFirstMove(): void {
        if (this._phase === GuidePhase.MoveHint) {
            this._setPhase(GuidePhase.BuildTower, '前往箭塔地块建造箭塔');
        }
    }

    private _onTowerBuilt(data: { isExpand?: boolean }): void {
        if (data.isExpand) {
            return;
        }
        if (this._phase <= GuidePhase.BuildTower) {
            this._setPhase(GuidePhase.CombatAndTrade, '击杀怪物拾取肉块，交付摊位换取金币');
        }
    }

    private _onCoin(data: CoinChangedPayload): void {
        this._coin = data.coin;
        if (
            !this._helperGuideShown &&
            this._coin >= GameConstants.GUIDE_HELPER_COIN_THRESHOLD &&
            this._phase === GuidePhase.CombatAndTrade
        ) {
            this._helperGuideShown = true;
            this._setPhase(GuidePhase.BuyHelper, '购买摊位帮手');
        }
    }

    private _onPurchase(data: { itemType: number }): void {
        if (data.itemType === 1) {
            this._setPhase(GuidePhase.BuyHero, '前往箭塔旁购买英雄（二选一）');
        }
        if (data.itemType === 3) {
            this._setPhase(GuidePhase.ExpandArea, '解锁东西两侧拓展地块');
        }
        if (data.itemType === 4) {
            this._setPhase(GuidePhase.ExpandArea, '建造拓展区箭塔即可通关');
        }
    }

    private _onHero(): void {
        if (this._phase === GuidePhase.BuyHero) {
            this._setPhase(GuidePhase.BuyCookedStall, '任意英雄解锁后可购买烤肉摊');
        }
    }

    private _onClear(): void {
        const msg = '本局完成！游戏结束';
        this._setPhase(GuidePhase.Finished, msg);
        if (this.clearPanel) {
            this.clearPanel.active = true;
        }
        const label = this.clearLabel ?? this.tipLabel;
        if (label) {
            label.node.active = true;
            label.string = msg;
        }
        console.log('[TutorialGuide]', msg);
    }
}
