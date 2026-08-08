import {
    _decorator,
    Component,
    Node,
    Enum,
    UITransform,
    UIOpacity,
    Sprite,
    SpriteFrame,
    Color,
    Button,
    tween,
    Vec3,
    view,
    instantiate,
    Prefab,
} from 'cc';
import { HeroType } from '../core/Enums';
import { EventBus, GameEvent } from '../core/GameEvent';
import { DefenseCombatSystem } from '../combat/DefenseCombatSystem';
import { Hero } from '../combat/Hero';

const { ccclass, property } = _decorator;

const ALL_HERO_TYPES: HeroType[] = [
    HeroType.IcePillar,
    HeroType.Storm,
    HeroType.Lightning,
    HeroType.Rocket,
];

/** 全局已占用英雄类型（同局只能选一次） */
const _takenHeroTypes = new Set<HeroType>();

/**
 * 英雄二选一：
 * Option = 卡片底；icon = 立绘槽。
 * 立绘按 TypeA/B 从 DefenseCombatSystem.heroPrefabs（或本组件 heroPrefabs）自动取 Sprite。
 * 已选过的英雄不会再出现在选项中。
 */
@ccclass('HeroSelectUI')
export class HeroSelectUI extends Component {
    @property({ type: Node, tooltip: '遮罩 Mask' })
    public mask: Node | null = null;

    @property({ type: Node, tooltip: '选项 A 卡片根' })
    public optionA: Node | null = null;

    @property({ type: Node, tooltip: '选项 B 卡片根' })
    public optionB: Node | null = null;

    @property({ type: Sprite, tooltip: 'A 卡立绘 Sprite（OptionA/icon）' })
    public heroIconA: Sprite | null = null;

    @property({ type: Sprite, tooltip: 'B 卡立绘 Sprite（OptionB/icon）' })
    public heroIconB: Sprite | null = null;

    @property({ type: Enum(HeroType), tooltip: '点 A 卡创建的英雄（仍可用时优先）' })
    public typeA: HeroType = HeroType.IcePillar;

    @property({ type: Enum(HeroType), tooltip: '点 B 卡创建的英雄（仍可用时优先）' })
    public typeB: HeroType = HeroType.Storm;

    @property({
        type: [Prefab],
        tooltip: '可选：本地英雄预制体（空则用 DefenseCombatSystem.heroPrefabs）',
    })
    public heroPrefabs: Prefab[] = [];

    @property({ type: DefenseCombatSystem, tooltip: '可选：战斗系统（空则场景内查找）' })
    public combat: DefenseCombatSystem | null = null;

    @property({ tooltip: '自动左右摆卡（已摆好请关）' })
    public autoPlaceCards: boolean = false;

    private _towerId: string = '';
    private _price: number = 60;
    private _closing: boolean = false;
    private _inited: boolean = false;
    private _offerA: HeroType = HeroType.IcePillar;
    private _offerB: HeroType | null = HeroType.Storm;

    public static isHeroTaken(type: HeroType): boolean {
        return _takenHeroTypes.has(type);
    }

    public static markHeroTaken(type: HeroType): void {
        _takenHeroTypes.add(type);
    }

    protected onLoad(): void {
        _takenHeroTypes.clear();
        this._ensureInit();
        EventBus.on(GameEvent.OPEN_HERO_SELECT, this._onOpenEvent, this);
        EventBus.on(GameEvent.HERO_SELECTED, this._onHeroSelectedMark, this);
        EventBus.on(GameEvent.HERO_CREATED, this._onHeroCreatedMark, this);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.OPEN_HERO_SELECT, this._onOpenEvent, this);
        EventBus.off(GameEvent.HERO_SELECTED, this._onHeroSelectedMark, this);
        EventBus.off(GameEvent.HERO_CREATED, this._onHeroCreatedMark, this);
    }

    public show(data: { towerId: string; price: number }): void {
        this._ensureInit();
        if (!this._refreshOffers()) {
            console.warn('[HeroSelectUI] 无可选英雄（均已占用）');
            this.hide();
            return;
        }
        if (!this.node.active) {
            this.node.active = true;
        }
        this._refreshIconsFromType();
        this._applyOpen(data);
    }

    public hide(): void {
        this.node.active = false;
    }

    private _onOpenEvent(data: { towerId: string; price: number }): void {
        this.show(data);
    }

    private _onHeroSelectedMark(data: { heroType: HeroType }): void {
        HeroSelectUI.markHeroTaken(data.heroType);
    }

    private _onHeroCreatedMark(data: { heroType?: HeroType }): void {
        if (data?.heroType !== undefined) {
            HeroSelectUI.markHeroTaken(data.heroType);
        }
    }

    /** 从未占用池中组两张卡；不足 2 张则只显示 A */
    private _refreshOffers(): boolean {
        const available = ALL_HERO_TYPES.filter((t) => !_takenHeroTypes.has(t));
        if (available.length === 0) {
            this._offerA = this.typeA;
            this._offerB = null;
            return false;
        }
        const preferred = [this.typeA, this.typeB].filter(
            (t, i, arr) => available.includes(t) && arr.indexOf(t) === i,
        );
        const rest = available.filter((t) => !preferred.includes(t));
        const ordered = [...preferred, ...rest];
        this._offerA = ordered[0];
        this._offerB = ordered.length > 1 ? ordered[1] : null;
        return true;
    }

    private _ensureInit(): void {
        if (this._inited) {
            return;
        }
        this._inited = true;
        this._autoBind();
        this._ensureMask();
        this._ensureOptionChrome(this.optionA);
        this._ensureOptionChrome(this.optionB);
        if (this.autoPlaceCards) {
            this._placeCards();
        }
        this._bindClicks();
        this._refreshIconsFromType();
    }

    private _autoBind(): void {
        if (!this.mask) {
            this.mask = this.node.getChildByName('Mask');
        }
        if (!this.optionA) {
            this.optionA = this.node.getChildByName('OptionA');
        }
        if (!this.optionB) {
            this.optionB = this.node.getChildByName('OptionB');
        }
        if (!this.heroIconA && this.optionA) {
            this.heroIconA = this._findIconSprite(this.optionA);
        }
        if (!this.heroIconB && this.optionB) {
            this.heroIconB = this._findIconSprite(this.optionB);
        }
        if (!this.combat) {
            this.combat = this.node.scene?.getComponentInChildren(DefenseCombatSystem) ?? null;
        }
    }

    private _findIconSprite(card: Node): Sprite | null {
        for (const name of ['icon', 'Icon', 'Hero', 'Portrait']) {
            const child = card.getChildByName(name);
            const sp = child?.getComponent(Sprite);
            if (sp) {
                return sp;
            }
        }
        for (const child of card.children) {
            const sp = child.getComponent(Sprite);
            if (sp) {
                return sp;
            }
        }
        return null;
    }

    /** 按当前要约 Type 从英雄预制体抠出 SpriteFrame 填到 Icon */
    private _refreshIconsFromType(): void {
        this._fillIcon(this.heroIconA, this._offerA);
        if (this._offerB !== null) {
            this._fillIcon(this.heroIconB, this._offerB);
        }
    }

    private _fillIcon(icon: Sprite | null, type: HeroType): void {
        if (!icon) {
            console.warn('[HeroSelectUI] Hero Icon 未绑定');
            return;
        }
        const frame = this._spriteFrameForType(type);
        if (!frame) {
            console.warn(
                `[HeroSelectUI] 无法为 HeroType=${type} 取立绘。请在 DefenseCombatSystem.heroPrefabs[${type}] 绑好预制体，且预制体 Visual 上有 Sprite。`,
            );
            return;
        }
        icon.spriteFrame = frame;
        icon.sizeMode = Sprite.SizeMode.CUSTOM;
        const ui = icon.node.getComponent(UITransform);
        if (ui && (ui.width < 8 || ui.height < 8)) {
            ui.setContentSize(120, 140);
        }
    }

    private _spriteFrameForType(type: HeroType): SpriteFrame | null {
        const prefab = this._prefabForType(type);
        if (!prefab) {
            return null;
        }
        const temp = instantiate(prefab);
        const visual = temp.getChildByName('Visual');
        const sp =
            visual?.getComponent(Sprite) ??
            visual?.getComponentInChildren(Sprite) ??
            temp.getComponent(Sprite) ??
            temp.getComponentInChildren(Sprite);
        const frame = sp?.spriteFrame ?? null;
        temp.destroy();
        return frame;
    }

    private _prefabForType(type: HeroType): Prefab | null {
        if (this.heroPrefabs?.[type]) {
            return this.heroPrefabs[type];
        }
        if (!this.combat) {
            this.combat = this.node.scene?.getComponentInChildren(DefenseCombatSystem) ?? null;
        }
        if (this.combat) {
            return this.combat.getHeroPrefab(type);
        }
        // 本地数组按 Hero.heroType 兜底匹配
        for (const p of this.heroPrefabs || []) {
            if (!p) {
                continue;
            }
            const temp = instantiate(p);
            const h = temp.getComponent(Hero) ?? temp.getComponentInChildren(Hero);
            const ok = h && h.heroType === type;
            temp.destroy();
            if (ok) {
                return p;
            }
        }
        return null;
    }

    private _ensureMask(): void {
        const rootUi = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        const vs = view.getVisibleSize();
        rootUi.setContentSize(vs.width, vs.height);
        if (!this.mask) {
            return;
        }
        const ui = this.mask.getComponent(UITransform) ?? this.mask.addComponent(UITransform);
        ui.setContentSize(vs.width, vs.height);
        this.mask.setPosition(0, 0, 0);
        const sp = this.mask.getComponent(Sprite);
        if (sp) {
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            const c = sp.color.clone();
            if (c.r > 40 || c.g > 40 || c.b > 40) {
                sp.color = new Color(0, 0, 0, Math.floor(255 * 0.4));
            }
        }
        let op = this.mask.getComponent(UIOpacity);
        if (!op) {
            op = this.mask.addComponent(UIOpacity);
        }
        if (op.opacity > 140) {
            op.opacity = Math.floor(255 * 0.4);
        }
    }

    private _ensureOptionChrome(card: Node | null): void {
        if (!card) {
            return;
        }
        if (!card.getComponent(Button)) {
            card.addComponent(Button);
        }
        if (!card.getComponent(UIOpacity)) {
            card.addComponent(UIOpacity);
        }
    }

    private _placeCards(): void {
        const gap = 80;
        const w = 180;
        if (this.optionA) {
            this.optionA.setPosition(-gap - w * 0.5, 0, 0);
        }
        if (this.optionB) {
            this.optionB.setPosition(gap + w * 0.5, 0, 0);
        }
    }

    private _bindClicks(): void {
        if (this.optionA) {
            this.optionA.off(Button.EventType.CLICK);
            this.optionA.on(Button.EventType.CLICK, () => this._choose(this._offerA, this.optionA!), this);
        }
        if (this.optionB) {
            this.optionB.off(Button.EventType.CLICK);
            this.optionB.on(
                Button.EventType.CLICK,
                () => {
                    if (this._offerB === null) {
                        return;
                    }
                    this._choose(this._offerB, this.optionB!);
                },
                this,
            );
        }
    }

    private _applyOpen(data: { towerId: string; price: number }): void {
        this._towerId = data.towerId;
        this._price = data.price;
        this._closing = false;
        this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
        if (this.optionA) {
            this.optionA.setScale(1, 1, 1);
            const op = this.optionA.getComponent(UIOpacity);
            if (op) {
                op.opacity = 255;
            }
            this.optionA.active = true;
        }
        if (this.optionB) {
            const showB = this._offerB !== null;
            this.optionB.active = showB;
            if (showB) {
                this.optionB.setScale(1, 1, 1);
                const op = this.optionB.getComponent(UIOpacity);
                if (op) {
                    op.opacity = 255;
                }
            }
        }
    }

    private _choose(type: HeroType, node: Node): void {
        if (this._closing || !this.node.active) {
            return;
        }
        if (HeroSelectUI.isHeroTaken(type)) {
            return;
        }
        this._closing = true;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        tween(node)
            .to(0.25, { scale: new Vec3(1.3, 1.3, 1) })
            .start();
        tween(opacity)
            .to(0.25, { opacity: 0 })
            .call(() => {
                EventBus.emit(GameEvent.HERO_SELECTED, {
                    heroType: type,
                    towerId: this._towerId,
                    price: this._price,
                });
                this.hide();
                opacity.opacity = 255;
                node.setScale(1, 1, 1);
            })
            .start();
    }
}
