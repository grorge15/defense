import { _decorator, Component, Node, Prefab, instantiate, Vec3, Animation, Enum } from 'cc';
import { HeroType, HeroCombatPhase } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { Enemy } from './Enemy';
import { EnemySpawner } from './EnemySpawner';

const { ccclass, property } = _decorator;

/**
 * 英雄：普攻发射光波打近怪；CD 满后范围技能（冰柱/风暴地面、雷电/火箭从天而降）。
 */
@ccclass('Hero')
export class Hero extends Component {
    @property({ type: Enum(HeroType), tooltip: '英雄技能类型' })
    public heroType: HeroType = HeroType.IcePillar;

    @property({ tooltip: '绑定储肉地块 ID（英雄击杀自动入库）' })
    public depositId: string = '';

    @property({ type: Prefab, tooltip: '普攻光波预制体' })
    public wavePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '范围技能特效预制体' })
    public skillPrefab: Prefab | null = null;

    @property({ tooltip: '普攻间隔' })
    public normalInterval: number = GameConstants.HERO_NORMAL_ATTACK_INTERVAL;

    @property({ tooltip: '大招 CD' })
    public skillCd: number = GameConstants.HERO_SKILL_CD;

    @property({ tooltip: '技能矩形行数' })
    public skillRows: number = GameConstants.HERO_SKILL_ROW_COUNT;

    @property({ tooltip: '技能矩形列数' })
    public skillCols: number = GameConstants.HERO_SKILL_COL_COUNT;

    @property({ tooltip: '技能格子间距' })
    public skillSpacing: number = GameConstants.HERO_SKILL_CELL_SPACING;

    @property({ tooltip: '技能起始延迟' })
    public skillStartDelay: number = GameConstants.HERO_SKILL_START_DELAY;

    @property({ tooltip: '从天而降技能的生成高度偏移（雷电/火箭）' })
    public skySpawnOffsetY: number = 200;

    @property({ tooltip: '技能命中半径' })
    public skillHitRadius: number = 40;

    @property({ tooltip: '动画组件（可选）' })
    public anim: Animation | null = null;

    @property({ type: EnemySpawner, tooltip: '场景中的 EnemySpawner（运行时可自动查找）' })
    public spawner: EnemySpawner | null = null;

    private _phase: HeroCombatPhase = HeroCombatPhase.NormalAttack;
    private _normalTimer: number = 0;
    private _skillTimer: number = 0;
    private _attacking: boolean = false;

    public get skillCdProgress(): number {
        return Math.min(1, this._skillTimer / this.skillCd);
    }

    public get phase(): HeroCombatPhase {
        return this._phase;
    }

    protected update(dt: number): void {
        if (!this.spawner) {
            this.spawner = this.node.scene?.getComponentInChildren(EnemySpawner) ?? null;
        }
        if (this._phase === HeroCombatPhase.SkillCasting) {
            return;
        }
        this._skillTimer += dt;
        if (this._skillTimer >= this.skillCd) {
            this._castSkill();
            return;
        }
        if (this._attacking) {
            return;
        }
        this._normalTimer += dt;
        if (this._normalTimer >= this.normalInterval) {
            this._normalTimer = 0;
            this._fireNormal();
        }
    }

    private _fireNormal(): void {
        if (!this.spawner || !this.wavePrefab) {
            return;
        }
        const from = this.node.worldPosition;
        const target = this.spawner.findNearest(from);
        if (!target) {
            return;
        }
        this._attacking = true;
        if (this.anim) {
            this.anim.play('attack');
        }
        const wave = instantiate(this.wavePrefab);
        wave.parent = this.node.parent;
        wave.setWorldPosition(from.x, from.y, 0);
        const dest = target.node.worldPosition.clone();
        const self = this;
        const depositId = this.depositId;
        // 简单直线飞向目标
        const duration = 0.35;
        let t = 0;
        const start = from.clone();
        const updateFn = (dt: number) => {
            if (!wave.isValid) {
                return;
            }
            t += dt;
            const k = Math.min(1, t / duration);
            wave.setWorldPosition(
                start.x + (dest.x - start.x) * k,
                start.y + (dest.y - start.y) * k,
                0,
            );
            if (k >= 1) {
                if (target.alive) {
                    target.kill(true, depositId);
                }
                wave.destroy();
                self._attacking = false;
                self.unschedule(updateFn);
            }
        };
        this.schedule(updateFn);
    }

    private async _castSkill(): Promise<void> {
        this._phase = HeroCombatPhase.SkillCasting;
        this._skillTimer = 0;
        if (this.anim) {
            this.anim.play('skill');
        }
        await this._wait(this.skillStartDelay);

        const origin = this._pickSkillOrigin();
        const isSky = this.heroType === HeroType.Lightning || this.heroType === HeroType.Rocket;
        const cells: Vec3[] = [];
        for (let r = 0; r < this.skillRows; r++) {
            for (let c = 0; c < this.skillCols; c++) {
                cells.push(
                    new Vec3(
                        origin.x + c * this.skillSpacing,
                        origin.y + r * this.skillSpacing,
                        0,
                    ),
                );
            }
        }

        for (const cell of cells) {
            await this._spawnSkillFx(cell, isSky);
        }

        this._phase = HeroCombatPhase.NormalAttack;
        this._normalTimer = 0;
    }

    private _pickSkillOrigin(): Vec3 {
        const from = this.node.worldPosition;
        if (this.spawner) {
            const near = this.spawner.findNearest(from, 400);
            if (near) {
                return near.node.worldPosition.clone();
            }
        }
        return new Vec3(from.x + 80, from.y, 0);
    }

    private _spawnSkillFx(cell: Vec3, isSky: boolean): Promise<void> {
        return new Promise((resolve) => {
            if (!this.skillPrefab) {
                this._killAround(cell);
                resolve();
                return;
            }
            const fx = instantiate(this.skillPrefab);
            fx.parent = this.node.parent;
            if (isSky) {
                fx.setWorldPosition(cell.x, cell.y + this.skySpawnOffsetY, 0);
                // 落到地面
                let t = 0;
                const dur = 0.2;
                const startY = cell.y + this.skySpawnOffsetY;
                const tick = (dt: number) => {
                    t += dt;
                    const k = Math.min(1, t / dur);
                    fx.setWorldPosition(cell.x, startY + (cell.y - startY) * k, 0);
                    if (k >= 1) {
                        this.unschedule(tick);
                        this._playFxAndKill(fx, cell, resolve);
                    }
                };
                this.schedule(tick);
            } else {
                fx.setWorldPosition(cell.x, cell.y, 0);
                this._playFxAndKill(fx, cell, resolve);
            }
        });
    }

    private _playFxAndKill(fx: Node, cell: Vec3, done: () => void): void {
        const anim = fx.getComponent(Animation) ?? fx.getComponentInChildren(Animation);
        this._killAround(cell);
        if (anim) {
            anim.play();
            anim.once(Animation.EventType.FINISHED, () => {
                fx.destroy();
                done();
            });
        } else {
            this.scheduleOnce(() => {
                fx.destroy();
                done();
            }, 0.3);
        }
    }

    private _killAround(cell: Vec3): void {
        if (!this.spawner) {
            return;
        }
        const list = this.spawner.findInRadius(cell, this.skillHitRadius);
        for (const e of list) {
            e.kill(true, this.depositId);
        }
    }

    private _wait(sec: number): Promise<void> {
        return new Promise((resolve) => this.scheduleOnce(() => resolve(), sec));
    }
}
