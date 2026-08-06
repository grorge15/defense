import {
    _decorator,
    Component,
    Node,
    Label,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    Vec3,
    Size,
    Enum,
    UITransform,
    Graphics,
    Color,
    HorizontalTextAlignment,
    VerticalTextAlignment,
    Overflow,
    Animation,
} from 'cc';
import { ResourceType } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';

const { ccclass, property } = _decorator;

const BUBBLE_W = 56;
const BUBBLE_H = 72;

/**
 * 顾客：队首显示需求气泡；交付时图标呼吸抖动；完成后打钩并向右离场。
 * UI 结构（customer 为根）：
 * DemandBubble / Bg(白) / Fill(绿竖直) / ItemIcon / CountLabel / CheckIcon
 */
@ccclass('Customer')
export class Customer extends Component {
    @property({ type: Node, tooltip: '需求气泡根节点 DemandBubble' })
    public bubbleRoot: Node | null = null;

    @property({ type: Node, tooltip: '竖直绿色填充节点 Fill（底锚点）' })
    public fillNode: Node | null = null;

    @property({ type: Label, tooltip: '气泡底部需求数量 Label' })
    public countLabel: Label | null = null;

    @property({ type: Node, tooltip: '气泡中间需求物品图标 ItemIcon' })
    public itemIcon: Node | null = null;

    @property({ type: Node, tooltip: '完成打钩图标 CheckIcon' })
    public checkIcon: Node | null = null;

    @property({ type: SpriteFrame, tooltip: '生肉需求图：刷到 itemIcon（预制体 need/肉）' })
    public meatSpriteFrame: SpriteFrame | null = null;

    @property({
        type: SpriteFrame,
        tooltip: '烤肉需求图：刷到同一 itemIcon；小图会按生肉图标显示框放大（请绑烤肉2）',
    })
    public cookedMeatSpriteFrame: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '木头需求图标 SpriteFrame（可选）' })
    public woodSpriteFrame: SpriteFrame | null = null;

    @property({ type: Enum(ResourceType), tooltip: '需求资源类型' })
    public demandType: ResourceType = ResourceType.RawMeat;

    @property({ type: Animation, tooltip: '角色序列帧 Animation（4 套 variant）' })
    public anim: Animation | null = null;

    private _demand: number = 0;
    private _maxDemand: number = 0;
    private _done: boolean = false;
    private _variantIndex: number = 0;
    private _walking: boolean = false;
    private _itemBaseScale: Vec3 = new Vec3(1, 1, 1);
    /** 以生肉 ItemIcon 的显示尺寸为基准，烤肉2 等小图放大到同框 */
    private _itemIconBox: Size | null = null;

    public get demandLeft(): number {
        return this._demand;
    }

    public get isDone(): boolean {
        return this._done;
    }

    protected onLoad(): void {
        this._ensureDemandUI();
        if (this.itemIcon) {
            this._itemBaseScale = this.itemIcon.scale.clone();
        }
    }

    public setupRandomDemand(type: ResourceType): void {
        this._ensureDemandUI();
        this.demandType = type;
        this._variantIndex = Math.floor(Math.random() * 4);
        const min = GameConstants.CUSTOMER_DEMAND_MIN;
        const max = Math.min(GameConstants.CUSTOMER_DEMAND_MAX, GameConstants.CUSTOMER_DEMAND_HARD_CAP);
        this._demand = min + Math.floor(Math.random() * (max - min + 1));
        this._maxDemand = this._demand;
        this._done = false;
        if (this.checkIcon) {
            this.checkIcon.active = false;
        }
        this._applyDemandIcon();
        this._refreshUI(false);
        this.setShowDemand(false);
        this._walking = false;
        this._playBodyClip('idle');
    }

    /** 切换 idle / walk（clip 名 Customer_{variant}_idle|walk） */
    public setWalking(walking: boolean): void {
        if (this._walking === walking && this.anim?.getState(this._clipName(walking ? 'walk' : 'idle'))?.isPlaying) {
            return;
        }
        this._walking = walking;
        this._playBodyClip(walking ? 'walk' : 'idle');
    }

    private _clipName(kind: 'idle' | 'walk'): string {
        return `Customer_${this._variantIndex}_${kind}`;
    }

    private _playBodyClip(kind: 'idle' | 'walk'): void {
        if (!this.anim) {
            this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        }
        if (!this.anim) {
            return;
        }
        const name = this._clipName(kind);
        this.anim.play(name);
        // 立刻采样第 0 帧，避免出生时仍显示预制体默认图
        const state = this.anim.getState(name);
        if (state) {
            state.time = 0;
            state.sample();
        }
    }

    /**
     * 与生肉摊同一 ItemIcon（need/肉）：
     * - 生肉：按生肉图自身尺寸显示（正常大小）
     * - 烤肉2 等更小的图：放大到与生肉 ItemIcon 同一显示框，避免缩成几像素
     */
    private _applyDemandIcon(): void {
        const spr = this._resolveItemIconSprite();
        if (!spr || !this.itemIcon) {
            return;
        }
        const frame = this._spriteFrameForDemand(this.demandType);
        if (!frame) {
            return;
        }
        this._ensureItemIconBox();
        spr.sizeMode = Sprite.SizeMode.CUSTOM;
        spr.spriteFrame = frame;
        const ui = this.itemIcon.getComponent(UITransform);
        if (ui && this._itemIconBox) {
            ui.setContentSize(this._itemIconBox.width, this._itemIconBox.height);
        }
    }

    /** 以生肉 SpriteFrame（或当前 ItemIcon）尺寸作为需求图标统一显示框 */
    private _ensureItemIconBox(): void {
        if (this._itemIconBox) {
            return;
        }
        if (this.meatSpriteFrame) {
            const r = this.meatSpriteFrame.rect;
            if (r.width > 0 && r.height > 0) {
                this._itemIconBox = new Size(r.width, r.height);
                return;
            }
        }
        const ui = this.itemIcon?.getComponent(UITransform);
        if (ui && ui.width > 0 && ui.height > 0) {
            this._itemIconBox = new Size(ui.width, ui.height);
        }
    }

    /** itemIcon 本体或其子节点上的 Sprite（与生肉摊 ItemIcon/「肉」一致） */
    private _resolveItemIconSprite(): Sprite | null {
        if (!this.itemIcon) {
            const bubble = this.bubbleRoot ?? this.node.getChildByName('bubble') ?? this.node.getChildByName('DemandBubble');
            const need = bubble?.getChildByName('need') ?? null;
            this.itemIcon =
                need?.getChildByName('肉') ??
                need?.getChildByName('ItemIcon') ??
                bubble?.getChildByName('ItemIcon') ??
                bubble?.getChildByName('肉') ??
                null;
        }
        if (!this.itemIcon) {
            return null;
        }
        return (
            this.itemIcon.getComponent(Sprite) ??
            this.itemIcon.getComponentInChildren(Sprite)
        );
    }

    private _spriteFrameForDemand(type: ResourceType): SpriteFrame | null {
        switch (type) {
            case ResourceType.CookedMeat:
                return this.cookedMeatSpriteFrame ?? this.meatSpriteFrame;
            case ResourceType.Wood:
                return this.woodSpriteFrame ?? this.meatSpriteFrame;
            default:
                return this.meatSpriteFrame;
        }
    }

    public setShowDemand(show: boolean): void {
        if (this.bubbleRoot) {
            // 完成后仍显示气泡（打钩），由 show 控制是否为队首
            this.bubbleRoot.active = show;
        }
    }

    /** 交付 1 单位，返回是否完成 */
    public deliverOne(): boolean {
        if (this._done || this._demand <= 0) {
            return this._done;
        }
        this._demand -= 1;
        this._pulseIcon();
        if (this._demand <= 0) {
            this._complete();
            return true;
        }
        this._refreshUI(false);
        return false;
    }

    public leave(direction: Vec3, onDone: () => void): void {
        this.setWalking(true);
        const start = this.node.worldPosition.clone();
        const end = new Vec3(start.x + direction.x, start.y + direction.y, 0);
        const dur = Math.max(0.35, GameConstants.CUSTOMER_LEAVE_ANIM_SEC);
        let t = 0;
        const tick = (dt: number) => {
            t += dt;
            const k = Math.min(1, t / dur);
            this.node.setWorldPosition(
                start.x + (end.x - start.x) * k,
                start.y + (end.y - start.y) * k,
                0,
            );
            if (k >= 1) {
                this.unschedule(tick);
                onDone();
            }
        };
        this.schedule(tick);
    }

    private _complete(): void {
        this._done = true;
        if (this.countLabel) {
            this.countLabel.node.active = false;
        }
        if (this.itemIcon) {
            this.itemIcon.active = false;
        }
        if (this.checkIcon) {
            this.checkIcon.active = true;
        }
        if (this.fillNode) {
            this.fillNode.setScale(1, 1, 1);
        }
        if (this.bubbleRoot) {
            this.bubbleRoot.active = true;
        }
    }

    private _refreshUI(completed: boolean): void {
        if (this.checkIcon) {
            this.checkIcon.active = completed;
        }
        if (this.itemIcon) {
            this.itemIcon.active = !completed;
        }
        if (this.countLabel) {
            this.countLabel.node.active = !completed;
            this.countLabel.string = `${this._demand}`;
        }
        if (this.fillNode && this._maxDemand > 0) {
            const ratio = completed ? 1 : 1 - this._demand / this._maxDemand;
            this.fillNode.setScale(1, Math.max(0.02, ratio), 1);
        }
    }

    /** 物品图标呼吸抖动 */
    private _pulseIcon(): void {
        if (!this.itemIcon) {
            return;
        }
        const n = this.itemIcon;
        const base = this._itemBaseScale;
        Tween.stopAllByTarget(n);
        tween(n)
            .to(0.08, { scale: new Vec3(base.x * 1.28, base.y * 1.28, 1) })
            .to(0.08, { scale: new Vec3(base.x * 0.88, base.y * 0.88, 1) })
            .to(0.08, { scale: new Vec3(base.x * 1.12, base.y * 1.12, 1) })
            .to(0.08, { scale: new Vec3(base.x, base.y, 1) })
            .start();
    }

    /** 以 customer 为根自动搭建需求气泡 UI（引用缺失时） */
    private _ensureDemandUI(): void {
        if (this.bubbleRoot && this.fillNode && this.countLabel && this.itemIcon && this.checkIcon) {
            return;
        }

        let bubble = this.bubbleRoot ?? this.node.getChildByName('DemandBubble');
        if (!bubble) {
            bubble = new Node('DemandBubble');
            bubble.parent = this.node;
            bubble.setPosition(0, 58, 0);
            bubble.addComponent(UITransform).setContentSize(BUBBLE_W, BUBBLE_H);
        }
        this.bubbleRoot = bubble;

        // 白底
        let bg = bubble.getChildByName('Bg');
        if (!bg) {
            bg = this._makeRectNode('Bg', bubble, BUBBLE_W, BUBBLE_H, new Color(255, 255, 255, 230));
            bg.setSiblingIndex(0);
        }

        // 绿色竖直填充（底锚点，scaleY 表示进度）
        if (!this.fillNode) {
            this.fillNode = bubble.getChildByName('Fill');
        }
        if (!this.fillNode) {
            const fillN = this._makeRectNode('Fill', bubble, BUBBLE_W - 8, BUBBLE_H - 8, new Color(80, 200, 90, 200));
            const ui = fillN.getComponent(UITransform)!;
            ui.setAnchorPoint(0.5, 0);
            fillN.setPosition(0, -(BUBBLE_H - 8) * 0.5, 0);
            fillN.setScale(1, 0.02, 1);
            this.fillNode = fillN;
        } else {
            const ui = this.fillNode.getComponent(UITransform);
            if (ui) {
                ui.setAnchorPoint(0.5, 0);
            }
        }

        // 中间物品图标
        if (!this.itemIcon) {
            this.itemIcon = bubble.getChildByName('ItemIcon');
        }
        if (!this.itemIcon) {
            const item = new Node('ItemIcon');
            item.parent = bubble;
            item.setPosition(0, 8, 0);
            item.addComponent(UITransform);
            const spr = item.addComponent(Sprite);
            spr.sizeMode = Sprite.SizeMode.TRIMMED;
            if (this.meatSpriteFrame) {
                spr.spriteFrame = this.meatSpriteFrame;
            } else {
                // 无图时用红色方块占位，表示生肉
                item.getComponent(UITransform)!.setContentSize(28, 28);
                const g = item.addComponent(Graphics);
                g.fillColor = new Color(220, 70, 70, 255);
                g.rect(-12, -12, 24, 24);
                g.fill();
            }
            this.itemIcon = item;
        }
        // 图标按当前 demandType 再刷一次（烤肉摊等）
        this._applyDemandIcon();

        // 底部数量
        if (!this.countLabel) {
            const countNode = bubble.getChildByName('CountLabel');
            if (countNode) {
                this.countLabel = countNode.getComponent(Label);
            }
        }
        if (!this.countLabel) {
            const countNode = new Node('CountLabel');
            countNode.parent = bubble;
            countNode.setPosition(0, -28, 0);
            countNode.addComponent(UITransform).setContentSize(40, 20);
            const label = countNode.addComponent(Label);
            label.string = '0';
            label.fontSize = 18;
            label.lineHeight = 20;
            label.color = new Color(40, 40, 40, 255);
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.overflow = Overflow.NONE;
            this.countLabel = label;
        }

        // 打钩
        if (!this.checkIcon) {
            this.checkIcon = bubble.getChildByName('CheckIcon');
        }
        if (!this.checkIcon) {
            const check = new Node('CheckIcon');
            check.parent = bubble;
            check.setPosition(0, 4, 0);
            check.addComponent(UITransform).setContentSize(40, 40);
            const label = check.addComponent(Label);
            label.string = '✓';
            label.fontSize = 32;
            label.lineHeight = 36;
            label.color = new Color(40, 180, 70, 255);
            label.horizontalAlign = HorizontalTextAlignment.CENTER;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            check.active = false;
            this.checkIcon = check;
        }

        bubble.active = false;
    }

    private _makeRectNode(name: string, parent: Node, w: number, h: number, color: Color): Node {
        const n = new Node(name);
        n.parent = parent;
        n.setPosition(0, 0, 0);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 8);
        g.fill();
        return n;
    }
}
