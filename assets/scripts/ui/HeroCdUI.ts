import { _decorator, Component, Sprite } from 'cc';
import { Hero } from '../combat/Hero';
import { SortingOrder2D } from '../core/SortingOrder2D';

const { ccclass, property } = _decorator;

/**
 * 英雄技能 CD：驱动 prefab 上已有的 `cd` 径向 Fill Sprite。
 * progress 0→1 蓄满后释放，Hero 计时归零后再从 0 循环。
 */
@ccclass('HeroCdUI')
export class HeroCdUI extends Component {
    @property({ type: Hero, tooltip: '绑定英雄（空则从父节点取）' })
    public hero: Hero | null = null;

    @property({ type: Sprite, tooltip: 'CD 填充 Sprite（空则取本节点 / cd 子节点）' })
    public cdSprite: Sprite | null = null;

    private _lastProgress: number = -1;

    /** 挂到英雄 prefab 的 cd 节点并驱动 fillRange */
    public static attachTo(hero: Hero): HeroCdUI {
        const cdNode =
            hero.node.getChildByName('cd') ??
            hero.node.getChildByName('Cd') ??
            hero.node.getChildByName('CdUI');
        if (!cdNode) {
            console.warn('[HeroCdUI] 英雄缺少 cd 节点', hero.node.name);
            let ui = hero.getComponent(HeroCdUI);
            if (!ui) {
                ui = hero.addComponent(HeroCdUI);
            }
            ui.hero = hero;
            ui._bindSprite();
            return ui;
        }

        let ui = cdNode.getComponent(HeroCdUI);
        if (!ui) {
            ui = cdNode.addComponent(HeroCdUI);
        }
        ui.hero = hero;
        ui._bindSprite();
        return ui;
    }

    protected onLoad(): void {
        if (!this.hero) {
            this.hero =
                this.node.parent?.getComponent(Hero) ??
                this.getComponentInParent(Hero) ??
                null;
        }
        this._bindSprite();
    }

    protected lateUpdate(): void {
        if (!this.hero || !this.hero.isValid) {
            return;
        }
        if (!this.cdSprite) {
            this._bindSprite();
        }
        const spr = this.cdSprite;
        if (!spr) {
            return;
        }
        const progress = this.hero.skillCdProgress;
        if (Math.abs(progress - this._lastProgress) < 0.002) {
            return;
        }
        this._lastProgress = progress;
        spr.fillRange = Math.max(0, Math.min(1, progress));
        this.node.getComponent(SortingOrder2D)?.applyOrder();
    }

    private _bindSprite(): void {
        if (this.cdSprite?.isValid) {
            this._ensureFilled(this.cdSprite);
            return;
        }
        let spr = this.node.getComponent(Sprite);
        if (!spr) {
            const cd =
                this.node.getChildByName('cd') ??
                this.node.getChildByName('Cd') ??
                this.node.getChildByName('CdUI');
            spr = cd?.getComponent(Sprite) ?? null;
        }
        this.cdSprite = spr;
        if (spr) {
            this._ensureFilled(spr);
            this._lastProgress = -1;
            spr.fillRange = Math.max(0, Math.min(1, this.hero?.skillCdProgress ?? 0));
        }
    }

    private _ensureFilled(spr: Sprite): void {
        if (spr.type !== Sprite.Type.FILLED) {
            spr.type = Sprite.Type.FILLED;
        }
        if (spr.fillType !== Sprite.FillType.RADIAL) {
            spr.fillType = Sprite.FillType.RADIAL;
        }
    }
}
