import {
    _decorator,
    Component,
    Vec2,
    Vec3,
    Animation,
    Collider2D,
    BoxCollider2D,
    Contact2DType,
    RigidBody2D,
    ERigidBody2DType,
    Size,
} from 'cc';
import { EventBus, GameEvent, EnemyDiedPayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { Wall } from './Wall';

const { ccclass, property } = _decorator;

/**
 * 敌人：向目标移动，遇城墙则攻击；任意攻击一击秒杀；死亡掉肉由经济系统处理。
 */
@ccclass('Enemy')
export class Enemy extends Component {
    @property({ tooltip: '移动速度' })
    public moveSpeed: number = GameConstants.ENEMY_MOVE_SPEED;

    @property({ tooltip: '攻击城墙间隔（秒）' })
    public attackInterval: number = 1.0;

    @property({ tooltip: '攻击城墙伤害' })
    public wallDamage: number = 5;

    @property({ tooltip: '动画组件（可选，子节点）' })
    public anim: Animation | null = null;

    private _rb: RigidBody2D | null = null;
    private _targetPos: Vec3 = new Vec3(0, 0, 0);
    private _blockedByWall: boolean = false;
    private _wallContactCount: number = 0;
    private _attackTimer: number = 0;
    private _alive: boolean = true;
    private _wallTarget: Wall | null = null;
    private _killedByHero: boolean = false;
    private _heroDepositId: string | undefined;

    public get alive(): boolean {
        return this._alive;
    }

    public setTarget(worldPos: Vec3): void {
        this._targetPos.set(worldPos.x, worldPos.y, 0);
    }

    protected onLoad(): void {
        this._rb = this.getComponent(RigidBody2D) ?? this.node.addComponent(RigidBody2D);
        this._rb.type = ERigidBody2DType.Dynamic;
        this._rb.gravityScale = 0;
        this._rb.fixedRotation = true;
        this._rb.allowSleep = false;
        this._rb.enabledContactListener = true;

        const col = this.getComponent(Collider2D);
        if (col instanceof BoxCollider2D) {
            const w = Math.abs(col.size.width) || 44;
            const h = Math.abs(col.size.height) || 32;
            col.size = new Size(w, h);
            col.sensor = false;
        }
        if (col) {
            col.on(Contact2DType.BEGIN_CONTACT, this._onHitWall, this);
            col.on(Contact2DType.END_CONTACT, this._onLeaveWall, this);
        }
    }

    protected onDestroy(): void {
        const col = this.getComponent(Collider2D);
        if (col) {
            col.off(Contact2DType.BEGIN_CONTACT, this._onHitWall, this);
            col.off(Contact2DType.END_CONTACT, this._onLeaveWall, this);
        }
    }

    protected update(dt: number): void {
        if (!this._alive) {
            return;
        }
        // XY 钳制
        const p = this.node.position;
        if (p.z !== 0) {
            this.node.setPosition(p.x, p.y, 0);
        }

        if (this._blockedByWall) {
            this._setVelocity(0, 0);
            this._attackTimer += dt;
            if (this._attackTimer >= this.attackInterval) {
                this._attackTimer = 0;
                this._playAttack();
                this._wallTarget?.takeDamage(this.wallDamage);
            }
            return;
        }

        const cur = this.node.worldPosition;
        const dx = this._targetPos.x - cur.x;
        const dy = this._targetPos.y - cur.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) {
            this._setVelocity(0, 0);
            return;
        }
        this._setVelocity((dx / len) * this.moveSpeed, (dy / len) * this.moveSpeed);
        this._playMove();
    }

    private _setVelocity(x: number, y: number): void {
        if (this._rb) {
            this._rb.linearVelocity = new Vec2(x, y);
        }
    }

    private _onHitWall(_self: Collider2D, other: Collider2D): void {
        const wall = other.getComponent(Wall) ?? other.node.getComponent(Wall);
        if (!wall) {
            return;
        }
        this._wallContactCount++;
        this._blockedByWall = true;
        this._wallTarget = wall;
        this._setVelocity(0, 0);
    }

    private _onLeaveWall(_self: Collider2D, other: Collider2D): void {
        const wall = other.getComponent(Wall) ?? other.node.getComponent(Wall);
        if (!wall) {
            return;
        }
        this._wallContactCount = Math.max(0, this._wallContactCount - 1);
        if (this._wallContactCount === 0) {
            this._blockedByWall = false;
            this._wallTarget = null;
        }
    }

    private _playMove(): void {
        if (this.anim && this.anim.getState('move') && !this.anim.getState('move')!.isPlaying) {
            this.anim.play('move');
        }
    }

    private _playAttack(): void {
        if (this.anim) {
            this.anim.play('attack');
        }
    }

    /**
     * 一击秒杀。byHero=true 时肉直接进绑定储肉地块。
     */
    public kill(byHero: boolean = false, heroDepositId?: string): void {
        if (!this._alive) {
            return;
        }
        this._alive = false;
        this._killedByHero = byHero;
        this._heroDepositId = heroDepositId;
        this._setVelocity(0, 0);
        if (this._rb) {
            this._rb.enabled = false;
        }
        if (this.anim) {
            this.anim.play('die');
            this.anim.once(Animation.EventType.FINISHED, () => this._emitDeathAndDestroy());
        } else {
            this._emitDeathAndDestroy();
        }
    }

    private _emitDeathAndDestroy(): void {
        const wp = this.node.worldPosition;
        const payload: EnemyDiedPayload = {
            worldPos: { x: wp.x, y: wp.y, z: 0 },
            byHero: this._killedByHero,
            heroDepositId: this._heroDepositId,
        };
        EventBus.emit(GameEvent.ENEMY_DIED, payload);
        this.node.destroy();
    }
}
