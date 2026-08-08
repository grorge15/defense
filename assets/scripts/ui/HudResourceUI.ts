import { _decorator, Component, Label, Sprite } from 'cc';
import { EventBus, GameEvent, CoinChangedPayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { ResourceType } from '../core/Enums';
import { PlayerCarryStack } from '../player/PlayerCarryStack';

const { ccclass, property } = _decorator;

/** 右上角肉块与金币 HUD（尺寸/位置以场景编辑为准，不在运行时覆盖） */
@ccclass('HudResourceUI')
export class HudResourceUI extends Component {
    @property({ type: Label, tooltip: '金币数值 Label' })
    public coinLabel: Label | null = null;

    @property({ type: Label, tooltip: '肉块数值 Label' })
    public meatLabel: Label | null = null;

    @property({ type: PlayerCarryStack, tooltip: '玩家背负（读肉数量，可选）' })
    public carry: PlayerCarryStack | null = null;

    @property({
        tooltip:
            '打包后若底图被刷回原图像素：仅强制 SizeMode=CUSTOM，不改你在编辑器设的宽高/坐标',
    })
    public keepCustomSizeMode: boolean = true;

    private _coin: number = GameConstants.PLAYER_INIT_COIN;
    private _meat: number = 0;

    protected onLoad(): void {
        this._ensureCustomSizeMode();
        EventBus.on(GameEvent.COIN_CHANGED, this._onCoin, this);
        EventBus.on(GameEvent.RESOURCE_PICKED, this._onPicked, this);
        this._refresh();
    }

    protected start(): void {
        // 原生包 spriteFrame 异步就绪后再确认一次 SizeMode
        this._ensureCustomSizeMode();
        this.scheduleOnce(() => this._ensureCustomSizeMode(), 0);
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

    private _onPicked(_data: { type: ResourceType }): void {
        // update 循环会刷新肉数
    }

    private _refresh(): void {
        if (this.coinLabel) {
            this.coinLabel.string = `${this._coin}`;
        }
        if (this.meatLabel) {
            this.meatLabel.string = `${this._meat}`;
        }
    }

    /** 只锁 SizeMode，不改 contentSize / 位置（尊重编辑器调整） */
    private _ensureCustomSizeMode(): void {
        if (!this.keepCustomSizeMode) {
            return;
        }
        this._forceCustom(this._findBgSprite('CoinRow', 'CoinBg'));
        this._forceCustom(this._findBgSprite('MeatRow', 'MeatBg'));
    }

    private _findBgSprite(rowName: string, bgName: string): Sprite | null {
        const row = this.node.getChildByName(rowName);
        const bg = row?.getChildByName(bgName);
        return bg?.getComponent(Sprite) ?? null;
    }

    private _forceCustom(spr: Sprite | null): void {
        if (!spr?.isValid) {
            return;
        }
        if (spr.sizeMode !== Sprite.SizeMode.CUSTOM) {
            spr.sizeMode = Sprite.SizeMode.CUSTOM;
        }
    }
}
