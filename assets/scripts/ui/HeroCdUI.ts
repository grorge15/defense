import {
    _decorator,
    Component,
    Color,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import { Hero } from '../combat/Hero';
import { SortingOrder2D } from '../core/SortingOrder2D';

const { ccclass, property } = _decorator;

/**
 * 英雄技能 CD：头顶 360° 绿色圆形填充。
 * 进度 0→1 蓄满后技能释放，Hero 计时归零后再从 0 循环。
 */
@ccclass('HeroCdUI')
export class HeroCdUI extends Component {
    @property({ type: Hero, tooltip: '绑定英雄（空则从父节点取）' })
    public hero: Hero | null = null;

    @property({ tooltip: '相对英雄的头顶偏移' })
    public offsetY: number = 55;

    @property({ tooltip: 'CD 环半径' })
    public radius: number = 14;

    @property({ tooltip: '填充颜色' })
    public fillColor: Color = new Color(80, 220, 90, 230);

    @property({ tooltip: '底圈颜色' })
    public bgColor: Color = new Color(30, 30, 30, 140);

    private _g: Graphics | null = null;
    private _lastProgress: number = -1;

    /** 挂到英雄身上并自动搭好环 */
    public static attachTo(hero: Hero): HeroCdUI {
        let uiNode = hero.node.getChildByName('CdUI');
        if (!uiNode) {
            uiNode = new Node('CdUI');
            uiNode.layer = hero.node.layer;
            uiNode.parent = hero.node;
        }
        let ui = uiNode.getComponent(HeroCdUI);
        if (!ui) {
            ui = uiNode.addComponent(HeroCdUI);
        }
        ui.hero = hero;
        ui._ensureVisual();
        return ui;
    }

    protected onLoad(): void {
        if (!this.hero) {
            this.hero = this.node.parent?.getComponent(Hero) ?? this.node.getComponentInParent(Hero);
        }
        this._ensureVisual();
    }

    protected lateUpdate(): void {
        if (!this.hero || !this.hero.isValid) {
            return;
        }
        this.node.setPosition(0, this.offsetY, 0);
        const progress = this.hero.skillCdProgress;
        if (Math.abs(progress - this._lastProgress) >= 0.002) {
            this._lastProgress = progress;
            this._redraw(progress);
        }
        this.node.getComponent(SortingOrder2D)?.applyOrder();
    }

    private _ensureVisual(): void {
        const size = this.radius * 2 + 4;
        let ui = this.node.getComponent(UITransform);
        if (!ui) {
            ui = this.node.addComponent(UITransform);
        }
        ui.setContentSize(size, size);

        this._g = this.node.getComponent(Graphics);
        if (!this._g) {
            this._g = this.node.addComponent(Graphics);
        }

        if (!this.node.getComponent(SortingOrder2D)) {
            const sort = this.node.addComponent(SortingOrder2D);
            sort.orderOffset = 2;
        }

        this.node.setPosition(0, this.offsetY, 0);
        this._lastProgress = -1;
        this._redraw(this.hero?.skillCdProgress ?? 0);
    }

    private _redraw(progress: number): void {
        const g = this._g;
        if (!g) {
            return;
        }
        const r = this.radius;
        const p = Math.max(0, Math.min(1, progress));
        g.clear();

        g.fillColor = this.bgColor;
        g.circle(0, 0, r);
        g.fill();

        if (p <= 0.001) {
            return;
        }

        // 从正上方开始顺时针填充（屏幕坐标 y 向上）
        const start = Math.PI * 0.5;
        const end = start - p * Math.PI * 2;
        g.fillColor = this.fillColor;
        g.moveTo(0, 0);
        g.arc(0, 0, r, start, end, true);
        g.close();
        g.fill();
    }
}
