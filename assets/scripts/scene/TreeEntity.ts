import { _decorator, Component, Sprite, Color, tween } from 'cc';
import { GameConstants } from '../core/GameConstants';
import { EventBus, GameEvent, TreeChoppedPayload } from '../core/GameEvent';

const { ccclass, property } = _decorator;

/**
 * 树木：砍 maxHits 次消失；每次掉落 dropMin~dropMax 个木头；受击约 1s 可见闪白。
 * 请把 Visual 子节点上的 Sprite 拖到 sprite（或保持子节点命名含 visual）。
 */
@ccclass('TreeEntity')
export class TreeEntity extends Component {
    @property({ tooltip: '树木唯一 ID' })
    public treeId: string = 'tree_0';

    @property({ tooltip: '可砍次数' })
    public maxHits: number = GameConstants.TREE_HIT_COUNT;

    @property({ tooltip: '单次砍伐最少掉落木头数' })
    public dropMin: number = 2;

    @property({ tooltip: '单次砍伐最多掉落木头数' })
    public dropMax: number = 3;

    @property({ tooltip: '受击闪白总时长（秒）' })
    public hitFlashSec: number = 1;

    @property({
        type: Sprite,
        tooltip: '树的渲染 Sprite（通常在 Visual/viusal 子节点上；空则自动找子节点）',
    })
    public sprite: Sprite | null = null;

    private _hitsLeft: number = 0;
    private _hitLocked: boolean = false;
    private _baseColor: Color = Color.WHITE.clone();
    private _warnedNoSprite: boolean = false;

    public get canChop(): boolean {
        return this._hitsLeft > 0 && this.node.active && !this._hitLocked;
    }

    protected onLoad(): void {
        this._hitsLeft = this.maxHits;
        this._ensureSprite();
        if (!this.treeId || this.treeId === 'tree_0') {
            this.treeId = `tree_${this.node.name}_${this.node.uuid.slice(0, 6)}`;
        }
    }

    public chop(_byId: string = 'player'): void {
        if (!this.canChop) {
            return;
        }
        this._hitsLeft--;
        const drop = this._rollDropCount();
        this._flashHit();
        const wp = this.node.worldPosition;
        const payload: TreeChoppedPayload = {
            treeId: this.treeId,
            worldPos: { x: wp.x, y: wp.y, z: 0 },
            amount: drop,
        };
        EventBus.emit(GameEvent.TREE_CHOPPED, payload);
        if (this._hitsLeft <= 0) {
            this.node.active = false;
        }
    }

    /** 在原位置重生 */
    public regrow(): void {
        this._hitsLeft = this.maxHits;
        this._hitLocked = false;
        this.node.active = true;
        this._ensureSprite();
        if (this.sprite) {
            this.sprite.color = this._baseColor.clone();
        }
    }

    private _rollDropCount(): number {
        const lo = Math.max(1, Math.floor(this.dropMin));
        const hi = Math.max(lo, Math.floor(this.dropMax));
        return lo + Math.floor(Math.random() * (hi - lo + 1));
    }

    private _ensureSprite(): void {
        if (this.sprite?.isValid) {
            if (this._baseColor.a <= 0) {
                this._baseColor = this.sprite.color.clone();
            }
            return;
        }
        this.sprite =
            this.getComponent(Sprite) ??
            this.getComponentInChildren(Sprite) ??
            this.node.getChildByName('Visual')?.getComponent(Sprite) ??
            this.node.getChildByName('visual')?.getComponent(Sprite) ??
            this.node.getChildByName('viusal')?.getComponent(Sprite) ??
            this.node.getChildByName('viusal-002')?.getComponent(Sprite) ??
            null;
        // 兼容拼写 viusal-*
        if (!this.sprite) {
            for (const child of this.node.children) {
                if (/viu?sual/i.test(child.name)) {
                    this.sprite = child.getComponent(Sprite) ?? child.getComponentInChildren(Sprite);
                    if (this.sprite) {
                        break;
                    }
                }
            }
        }
        if (this.sprite) {
            this._baseColor = this.sprite.color.clone();
        }
    }

    /**
     * 受击闪白约 1s，期间不可再砍。
     * 贴图本身已是白底时：先压暗再拉回纯白，否则「设成白色」完全看不见。
     */
    private _flashHit(): void {
        this._hitLocked = true;
        const duration = Math.max(0.25, this.hitFlashSec);
        this._ensureSprite();
        if (!this.sprite) {
            if (!this._warnedNoSprite) {
                this._warnedNoSprite = true;
                console.warn(
                    `[TreeEntity] ${this.node.name} 未找到 Sprite：请把 Visual 上的 Sprite 拖到 TreeEntity.sprite，否则无受击闪白`,
                );
            }
            this.scheduleOnce(() => {
                this._hitLocked = false;
            }, duration);
            return;
        }

        const spr = this.sprite;
        const base = this._baseColor.clone();
        tween(spr).stop();

        const nearWhite = base.r >= 240 && base.g >= 240 && base.b >= 240;
        const dim = nearWhite
            ? new Color(110, 110, 110, base.a)
            : new Color(
                  Math.floor(base.r * 0.55),
                  Math.floor(base.g * 0.55),
                  Math.floor(base.b * 0.55),
                  base.a,
              );
        const peak = new Color(255, 255, 255, base.a);

        spr.color = dim;
        tween(spr)
            .to(0.1, { color: peak })
            .delay(Math.max(0, duration - 0.25))
            .to(0.15, { color: base })
            .call(() => {
                this._hitLocked = false;
            })
            .start();
    }
}
