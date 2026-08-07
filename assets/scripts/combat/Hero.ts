import {
    _decorator,
    Component,
    Node,
    Prefab,
    instantiate,
    Vec3,
    Animation,
    Enum,
    UITransform,
} from 'cc';
import { HeroType, HeroCombatPhase } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';
import { playAnimClip } from '../core/AnimPlay';
import { Enemy } from './Enemy';
import { EnemySpawner } from './EnemySpawner';
import { ProjectileMovement } from './ProjectileMovement';
import { SkillEffectPlayback } from './SkillEffectPlayback';

const { ccclass, property } = _decorator;

/** skillPos 本地矩形（UITransform 内容区；经 UISkew 后即为地上菱形） */
type SkillLocalArea = {
    ui: UITransform;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

/**
 * 英雄：普攻发射光波打近怪；CD 满后扇形范围技能（行内齐射、逐行加宽）。
 * 大招落点在 skillPos 本地扇形内布点再转世界坐标（兼容 UISkew 视觉菱形）。
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

    @property({ type: Node, tooltip: '大招范围节点（City/skillPos，取 UITransform 世界 AABB）' })
    public skillBounds: Node | null = null;

    @property({ tooltip: '普攻间隔' })
    public normalInterval: number = GameConstants.HERO_NORMAL_ATTACK_INTERVAL;

    @property({ tooltip: '大招 CD' })
    public skillCd: number = GameConstants.HERO_SKILL_CD;

    @property({ tooltip: '扇形行数' })
    public skillRows: number = GameConstants.HERO_SKILL_ROW_COUNT;

    @property({ tooltip: '扇形首行 effect 数量（之后每行 +1）' })
    public skillCols: number = GameConstants.HERO_SKILL_COL_COUNT;

    @property({ tooltip: '同行相邻 effect 间距' })
    public skillSpacing: number = GameConstants.HERO_SKILL_CELL_SPACING;

    @property({ tooltip: '扇形相邻行间距（沿扇形朝向）' })
    public skillRowSpacing: number = GameConstants.HERO_SKILL_ROW_SPACING;

    @property({ tooltip: '扇形朝向：true=指向 skillPos 内最近敌人；false=指向区域中心' })
    public fanTowardNearestEnemy: boolean = true;

    @property({ tooltip: '技能起始延迟（起手后多久开始刷第一行）' })
    public skillStartDelay: number = GameConstants.HERO_SKILL_START_DELAY;

    @property({ tooltip: '大招总时长（秒）：含起手延迟，结束后恢复普攻；多 effect 会均分错开' })
    public skillTotalDuration: number = GameConstants.HERO_SKILL_TOTAL_DURATION;

    @property({ tooltip: '最后一个 effect 生成后再等待（秒），再恢复普攻' })
    public skillEndPadding: number = GameConstants.HERO_SKILL_END_PADDING;

    @property({ tooltip: '从天而降技能下落时长（雷电/火箭）' })
    public skyFallDuration: number = GameConstants.HERO_SKILL_SKY_FALL;

    @property({ tooltip: '从天而降技能的生成高度偏移（雷电/火箭）' })
    public skySpawnOffsetY: number = 200;

    @property({ tooltip: '单个 effect 范围伤害半径（秒杀圈内敌人）' })
    public skillHitRadius: number = GameConstants.HERO_SKILL_HIT_RADIUS;

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

    protected onLoad(): void {
        if (!this.anim) {
            this.anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        }
        this._ensureSkillBounds();
        this._playIdle();
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

    private _playIdle(): void {
        playAnimClip(this.anim, 'idle');
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
        playAnimClip(this.anim, 'attack', { restart: true });
        const wave = instantiate(this.wavePrefab);
        wave.parent = this.node.parent;
        wave.setWorldPosition(from.x, from.y, 0);
        const dest = target.node.worldPosition.clone();
        const self = this;
        const depositId = this.depositId;
        const proj = wave.getComponent(ProjectileMovement) ?? wave.addComponent(ProjectileMovement);
        proj.launchTo(dest, 0.35, () => {
            if (target.alive) {
                target.kill(true, depositId);
            }
            self._attacking = false;
            self._playIdle();
        });
    }

    private async _castSkill(): Promise<void> {
        this._phase = HeroCombatPhase.SkillCasting;
        this._skillTimer = 0;
        if (this.anim) {
            playAnimClip(this.anim, 'skill', { restart: true });
        }
        await this._wait(this.skillStartDelay);

        // 扇形：首行 5 个齐射，逐行 +1，行与行之间错开
        const area = this._getSkillLocalArea();
        const rowGroups = area ? this._buildFanRowsLocal(area) : this._buildFanRowsWorldFallback();
        const isSky = this.heroType === HeroType.Lightning || this.heroType === HeroType.Rocket;

        const rowCount = rowGroups.length;
        const budget = Math.max(
            0,
            this.skillTotalDuration - this.skillStartDelay - this.skillEndPadding,
        );
        const rowStagger = rowCount > 1 ? budget / (rowCount - 1) : 0;

        for (let r = 0; r < rowCount; r++) {
            if (r > 0 && rowStagger > 0) {
                await this._wait(rowStagger);
            }
            for (const cell of rowGroups[r]) {
                this._spawnSkillFx(cell, isSky);
            }
        }

        await this._wait(this.skillEndPadding);
        this._phase = HeroCombatPhase.NormalAttack;
        this._normalTimer = 0;
        this._playIdle();
    }

    /**
     * 扇形布点：第 r 行有 (skillCols + r) 个 effect，行内齐射。
     * 起点 = skillPos 离英雄最近的边；朝向 = 最近敌人或区域中心。
     */
    private _buildFanRowsLocal(area: SkillLocalArea): Vec3[][] {
        const axes = this._resolveFanAxesLocal(area);
        return this._buildFanRowsFromAxes(
            area,
            axes.originX,
            axes.originY,
            axes.forwardX,
            axes.forwardY,
            axes.rightX,
            axes.rightY,
            (lx, ly) => {
                const wx = this._clamp(lx, area.minX, area.maxX);
                const wy = this._clamp(ly, area.minY, area.maxY);
                const world = area.ui.convertToWorldSpaceAR(new Vec3(wx, wy, 0));
                return new Vec3(world.x, world.y, 0);
            },
        );
    }

    private _resolveFanAxesLocal(area: SkillLocalArea): {
        originX: number;
        originY: number;
        forwardX: number;
        forwardY: number;
        rightX: number;
        rightY: number;
    } {
        const heroL = area.ui.convertToNodeSpaceAR(this.node.worldPosition);
        const origin = this._nearestEdgeAnchor(area, heroL);
        const cx = (area.minX + area.maxX) * 0.5;
        const cy = (area.minY + area.maxY) * 0.5;

        let fx = cx - origin.x;
        let fy = cy - origin.y;
        if (this.fanTowardNearestEnemy && this.spawner) {
            const near = this._findNearestInSkillLocal(area, this.node.worldPosition, 400);
            if (near) {
                const el = area.ui.convertToNodeSpaceAR(near.node.worldPosition);
                fx = el.x - origin.x;
                fy = el.y - origin.y;
            }
        }
        let len = Math.hypot(fx, fy);
        if (len < 1e-3) {
            fx = 0;
            fy = 1;
            len = 1;
        }
        fx /= len;
        fy /= len;
        return {
            originX: origin.x,
            originY: origin.y,
            forwardX: fx,
            forwardY: fy,
            rightX: -fy,
            rightY: fx,
        };
    }

    /** skillPos 内离参考点最近的那条边上的锚点 */
    private _nearestEdgeAnchor(area: SkillLocalArea, ref: Vec3): Vec3 {
        const dLeft = Math.abs(ref.x - area.minX);
        const dRight = Math.abs(ref.x - area.maxX);
        const dBottom = Math.abs(ref.y - area.minY);
        const dTop = Math.abs(ref.y - area.maxY);
        const minD = Math.min(dLeft, dRight, dBottom, dTop);
        if (minD === dLeft) {
            return new Vec3(area.minX, this._clamp(ref.y, area.minY, area.maxY), 0);
        }
        if (minD === dRight) {
            return new Vec3(area.maxX, this._clamp(ref.y, area.minY, area.maxY), 0);
        }
        if (minD === dBottom) {
            return new Vec3(this._clamp(ref.x, area.minX, area.maxX), area.minY, 0);
        }
        return new Vec3(this._clamp(ref.x, area.minX, area.maxX), area.maxY, 0);
    }

    private _buildFanRowsFromAxes(
        _area: SkillLocalArea | null,
        originX: number,
        originY: number,
        forwardX: number,
        forwardY: number,
        rightX: number,
        rightY: number,
        toWorld: (lx: number, ly: number) => Vec3,
    ): Vec3[][] {
        const rows: Vec3[][] = [];
        const seen = new Set<string>();
        const rowStep = Math.max(8, this.skillRowSpacing);

        for (let r = 0; r < this.skillRows; r++) {
            const count = this.skillCols + r;
            const row: Vec3[] = [];
            const cx = originX + forwardX * r * rowStep;
            const cy = originY + forwardY * r * rowStep;

            for (let i = 0; i < count; i++) {
                const t = i - (count - 1) * 0.5;
                const lx = cx + rightX * t * this.skillSpacing;
                const ly = cy + rightY * t * this.skillSpacing;
                const key = `${Math.round(lx)}_${Math.round(ly)}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                row.push(toWorld(lx, ly));
            }
            if (row.length > 0) {
                rows.push(row);
            }
        }
        return rows;
    }

    private _findNearestInSkillLocal(
        area: SkillLocalArea,
        from: Vec3,
        maxDist: number,
    ): Enemy | null {
        if (!this.spawner) {
            return null;
        }
        let best: Enemy | null = null;
        let bestD = maxDist;
        const list = this.spawner.findInRadius(from, maxDist);
        for (const e of list) {
            if (!e.alive) {
                continue;
            }
            const local = area.ui.convertToNodeSpaceAR(e.node.worldPosition);
            if (
                local.x < area.minX ||
                local.x > area.maxX ||
                local.y < area.minY ||
                local.y > area.maxY
            ) {
                continue;
            }
            const wp = e.node.worldPosition;
            const dx = wp.x - from.x;
            const dy = wp.y - from.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestD) {
                bestD = d;
                best = e;
            }
        }
        return best;
    }

    /** 无 skillPos 时：以英雄附近为扇形起点，朝最近敌人展开 */
    private _buildFanRowsWorldFallback(): Vec3[][] {
        const from = this.node.worldPosition;
        let originX = from.x + 40;
        let originY = from.y;
        let fx = 1;
        let fy = 0;
        if (this.spawner) {
            const near = this.spawner.findNearest(from, 400);
            if (near) {
                const tp = near.node.worldPosition;
                fx = tp.x - originX;
                fy = tp.y - originY;
            }
        }
        if (!this.fanTowardNearestEnemy) {
            fx = 80;
            fy = 0;
        }
        let len = Math.hypot(fx, fy);
        if (len < 1e-3) {
            fx = 1;
            fy = 0;
            len = 1;
        }
        fx /= len;
        fy /= len;
        const rightX = -fy;
        const rightY = fx;
        return this._buildFanRowsFromAxes(
            null,
            originX,
            originY,
            fx,
            fy,
            rightX,
            rightY,
            (lx, ly) => new Vec3(lx, ly, 0),
        );
    }

    private _ensureSkillBounds(): void {
        if (this.skillBounds?.isValid) {
            return;
        }
        const scene = this.node.scene;
        if (!scene) {
            return;
        }
        const city = this._findChildByName(scene, 'City');
        const pos = city?.getChildByName('skillPos') ?? this._findChildByName(scene, 'skillPos');
        if (pos) {
            this.skillBounds = pos;
        }
    }

    private _getSkillLocalArea(): SkillLocalArea | null {
        this._ensureSkillBounds();
        if (!this.skillBounds?.isValid) {
            return null;
        }
        const ui = this.skillBounds.getComponent(UITransform);
        if (!ui) {
            return null;
        }
        const w = ui.contentSize.width;
        const h = ui.contentSize.height;
        if (w <= 0 || h <= 0) {
            return null;
        }
        const ax = ui.anchorPoint.x;
        const ay = ui.anchorPoint.y;
        return {
            ui,
            minX: -w * ax,
            maxX: w * (1 - ax),
            minY: -h * ay,
            maxY: h * (1 - ay),
        };
    }

    private _clamp(v: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, v));
    }

    private _findChildByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const child of root.children) {
            const found = this._findChildByName(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    /** 刷一个范围伤害 effect；不阻塞大招流程（特效播完自行销毁） */
    private _spawnSkillFx(cell: Vec3, isSky: boolean): void {
        if (!this.skillPrefab) {
            this._aoeKill(cell);
            return;
        }
        const fx = instantiate(this.skillPrefab);
        fx.parent = this.node.parent;
        if (isSky) {
            fx.setWorldPosition(cell.x, cell.y + this.skySpawnOffsetY, 0);
            const dur = Math.max(0.05, this.skyFallDuration);
            const startY = cell.y + this.skySpawnOffsetY;
            let t = 0;
            const tick = (dt: number) => {
                if (!fx.isValid) {
                    this.unschedule(tick);
                    return;
                }
                t += dt;
                const k = Math.min(1, t / dur);
                fx.setWorldPosition(cell.x, startY + (cell.y - startY) * k, 0);
                if (k >= 1) {
                    this.unschedule(tick);
                    this._impactFx(fx, cell);
                }
            };
            this.schedule(tick);
        } else {
            fx.setWorldPosition(cell.x, cell.y, 0);
            this._impactFx(fx, cell);
        }
    }

    private _impactFx(fx: Node, cell: Vec3): void {
        this._aoeKill(cell);
        if (fx.getComponent(SkillEffectPlayback)) {
            return;
        }
        const anim = fx.getComponent(Animation) ?? fx.getComponentInChildren(Animation);
        if (anim) {
            anim.play();
            anim.once(Animation.EventType.FINISHED, () => {
                if (fx.isValid) {
                    fx.destroy();
                }
            });
        } else {
            this.scheduleOnce(() => {
                if (fx.isValid) {
                    fx.destroy();
                }
            }, 0.3);
        }
    }

    /** 单个 effect：圈内所有敌人一击秒杀 */
    private _aoeKill(cell: Vec3): void {
        if (!this.spawner) {
            return;
        }
        const list = this.spawner.findInRadius(cell, this.skillHitRadius);
        for (const e of list) {
            e.kill(true, this.depositId);
        }
    }

    private _wait(sec: number): Promise<void> {
        return new Promise((resolve) => this.scheduleOnce(() => resolve(), Math.max(0, sec)));
    }
}
