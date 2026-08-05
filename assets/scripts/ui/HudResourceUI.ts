import { _decorator, Component, Label } from 'cc';
import { EventBus, GameEvent, CoinChangedPayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { ResourceType } from '../core/Enums';
import { PlayerCarryStack } from '../player/PlayerCarryStack';

const { ccclass, property } = _decorator;

/** 右上角肉块与金币 HUD */
@ccclass('HudResourceUI')
export class HudResourceUI extends Component {
    @property({ type: Label, tooltip: '金币数值 Label' })
    public coinLabel: Label | null = null;

    @property({ type: Label, tooltip: '肉块数值 Label' })
    public meatLabel: Label | null = null;

    @property({ type: PlayerCarryStack, tooltip: '玩家背负（读肉数量，可选）' })
    public carry: PlayerCarryStack | null = null;

    private _coin: number = GameConstants.PLAYER_INIT_COIN;
    private _meat: number = 0;

    protected onLoad(): void {
        EventBus.on(GameEvent.COIN_CHANGED, this._onCoin, this);
        EventBus.on(GameEvent.RESOURCE_PICKED, this._onPicked, this);
        this._refresh();
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.COIN_CHANGED, this._onCoin, this);
        EventBus.off(GameEvent.RESOURCE_PICKED, this._onPicked, this);
    }

    protected update(): void {
        if (this.carry) {
            const meat =
                this.carry.getCount(ResourceType.RawMeat) + this.carry.getCount(ResourceType.CookedMeat);
            if (meat !== this._meat) {
                this._meat = meat;
                this._refresh();
            }
        }
    }

    private _onCoin(data: CoinChangedPayload): void {
        this._coin = data.coin;
        this._refresh();
    }

    private _onPicked(data: { type: ResourceType }): void {
        if (data.type === ResourceType.RawMeat || data.type === ResourceType.CookedMeat) {
            // update 循环会刷新
        }
    }

    private _refresh(): void {
        if (this.coinLabel) {
            this.coinLabel.string = `${this._coin}`;
        }
        if (this.meatLabel) {
            this.meatLabel.string = `${this._meat}`;
        }
    }
}
