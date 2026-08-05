import { _decorator, Component, Node, Sprite, Color, tween, UITransform } from 'cc';
import { EventBus, GameEvent } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';

const { ccclass, property } = _decorator;

/**
 * 城墙血量管理；归零无失败惩罚，仅血条表现。受击闪白。
 */
@ccclass('Wall')
export class Wall extends Component {
    @property({ tooltip: '最大血量' })
    public maxHp: number = GameConstants.WALL_MAX_HP;

    @property({ type: Node, tooltip: '血条背景节点' })
    public hpBg: Node | null = null;

    @property({ type: Node, tooltip: '血条绿条节点（左锚点，水平 scaleX 填充）' })
    public hpFill: Node | null = null;

    @property({ type: Sprite, tooltip: '用于闪白的渲染 Sprite（Visual 上）' })
    public flashSprite: Sprite | null = null;

    private _hp: number = 0;

    public get hp(): number {
        return this._hp;
    }

    protected onLoad(): void {
        this._hp = this.maxHp;
        this._ensureHpFillAnchor();
        this._refreshHpBar();
    }

    /** 血条从左向右填充，需左锚点 */
    private _ensureHpFillAnchor(): void {
        if (!this.hpFill) {
            return;
        }
        const ui = this.hpFill.getComponent(UITransform);
        if (ui) {
            ui.setAnchorPoint(0, 0.5);
        }
    }

    public takeDamage(amount: number): void {
        this._hp = Math.max(0, this._hp - amount);
        this._refreshHpBar();
        this._flashWhite();
        EventBus.emit(GameEvent.WALL_HP_CHANGED, { hp: this._hp, maxHp: this.maxHp });
    }

    private _refreshHpBar(): void {
        if (!this.hpFill) {
            return;
        }
        const ratio = this.maxHp > 0 ? this._hp / this.maxHp : 0;
        const s = this.hpFill.scale;
        this.hpFill.setScale(ratio, s.y, s.z);
    }

    private _flashWhite(): void {
        if (!this.flashSprite) {
            return;
        }
        const spr = this.flashSprite;
        const origin = spr.color.clone();
        spr.color = Color.WHITE;
        tween(spr)
            .delay(0.08)
            .call(() => {
                spr.color = origin;
            })
            .start();
    }
}
