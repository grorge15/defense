import { _decorator, Component, Sprite, Color, tween } from 'cc';
import { GameConstants } from '../core/GameConstants';
import { EventBus, GameEvent, TreeChoppedPayload } from '../core/GameEvent';

const { ccclass, property } = _decorator;

/**
 * 树木：砍 maxHits 次消失；每次固定掉 1 个木头；受击短暂变色（默认短闪，最长 0.25s）。
 * 规格：一棵树每砍一次掉落一个木头，共 5 次消失。
 */
@ccclass('TreeEntity')
export class TreeEntity extends Component {
    @property({ tooltip: '树木唯一 ID' })
    public treeId: string = 'tree_0';

    @property({ tooltip: '可砍次数（规格 5）' })
    public maxHits: number = GameConstants.TREE_HIT_COUNT;

    @property({
        tooltip: '受击泛白时长（秒）。规格短闪；场景填再大也会被钳到 0.25s；填 0 关闭',
    })
    public hitFlashSec: number = 0.15;

    @property({ tooltip: '受击后再次可砍间隔（秒）' })
    public hitLockSec: number = 0.35;

    @property({ tooltip: '渲染 Sprite（砍伐颜色动画；空则自动找子节点）' })
    public sprite: Sprite | null = null;

    private _hitsLeft: number = 0;
    private _hitLocked: boolean = false;
    private _baseColor: Color = Color.WHITE.clone();

    public get canChop(): boolean {
        return this._hitsLeft > 0 && this.node.active && !this._hitLocked;
    }

    protected onLoad(): void {
        this._hitsLeft = this.maxHits;
        if (!this.sprite) {
            this.sprite = this.getComponent(Sprite) ?? this.getComponentInChildren(Sprite);
        }
        if (this.sprite) {
            this._baseColor = this.sprite.color.clone();
        }
        if (!this.treeId || this.treeId === 'tree_0') {
            this.treeId = `tree_${this.node.name}_${this.node.uuid.slice(0, 6)}`;
        }
    }

    public chop(_byId: string = 'player'): void {
        if (!this.canChop) {
            return;
        }
        this._hitsLeft--;
        this._flashHit();
        const wp = this.node.worldPosition;
        // 规格强制：每次砍伐只掉 1 个木头（不读旧场景 dropMin/dropMax）
        EventBus.emit(GameEvent.TREE_CHOPPED, {
            treeId: this.treeId,
            worldPos: { x: wp.x, y: wp.y, z: 0 },
            amount: 1,
        } as TreeChoppedPayload);
        if (this._hitsLeft <= 0) {
            this.node.active = false;
        }
    }

    public regrow(): void {
        this._hitsLeft = this.maxHits;
        this._hitLocked = false;
        this.node.active = true;
        if (this.sprite) {
            this.sprite.color = this._baseColor.clone();
        }
    }

    private _flashHit(): void {
        this._hitLocked = true;
        const lock = Math.max(0.05, this.hitLockSec);
        // 防止场景里残留 hitFlashSec=1 导致「泛白 1 秒」
        const flash = Math.min(0.25, Math.max(0, this.hitFlashSec));
        if (flash > 0 && this.sprite) {
            const spr = this.sprite;
            tween(spr).stop();
            spr.color = new Color(255, 255, 255, 255);
            tween(spr)
                .to(flash, { color: this._baseColor.clone() })
                .start();
        }
        this.scheduleOnce(() => {
            this._hitLocked = false;
        }, lock);
    }
}
