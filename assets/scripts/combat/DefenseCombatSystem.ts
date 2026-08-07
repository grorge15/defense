import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { PlayerState, HeroType } from '../core/Enums';
import { EventBus, GameEvent, PlayerStatePayload, CreateHeroPayload, PlayerActionFinishedPayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { Enemy } from './Enemy';
import { EnemySpawner } from './EnemySpawner';
import { Hero } from './Hero';
import { ArrowTower } from './ArrowTower';
import { PlayerController } from '../player/PlayerController';
import { TowerMountTrigger } from '../player/TowerMountTrigger';
import { HeroCdUI } from '../ui/HeroCdUI';
import { ProjectileMovement } from './ProjectileMovement';

const { ccclass, property } = _decorator;

/**
 * 防守战斗系统入口：玩家近战/箭塔射击、英雄创建指令响应。
 * 禁止：资源实体生成、金币结算、NPC 控制。
 */
@ccclass('DefenseCombatSystem')
export class DefenseCombatSystem extends Component {
    @property({ type: EnemySpawner, tooltip: '敌人刷新器' })
    public spawner: EnemySpawner | null = null;

    @property({ type: PlayerController, tooltip: '玩家控制器' })
    public player: PlayerController | null = null;

    @property({ type: Prefab, tooltip: '箭预制体（箭塔远程）' })
    public arrowPrefab: Prefab | null = null;

    @property({ type: [Prefab], tooltip: '四种英雄预制体，按 HeroType 索引：0冰柱 1风暴 2雷电 3火箭' })
    public heroPrefabs: Prefab[] = [];

    @property({ type: Prefab, tooltip: '英雄普攻光波（英雄预制体未绑 wavePrefab 时回退）' })
    public defaultHeroWavePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: '英雄范围技能特效（英雄预制体未绑 skillPrefab 时回退）' })
    public defaultHeroSkillPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: '英雄大招范围（City/skillPos）；创建英雄时写入 Hero.skillBounds' })
    public heroSkillBounds: Node | null = null;

    @property({ type: Node, tooltip: '英雄挂载父节点' })
    public heroRoot: Node | null = null;

    @property({ tooltip: '地面近战冷却' })
    public meleeCooldown: number = GameConstants.PLAYER_MELEE_COOLDOWN;

    @property({ tooltip: '地面近战圆形伤害半径' })
    public meleeRadius: number = GameConstants.PLAYER_MELEE_RANGE;

    @property({ tooltip: '箭命中固定时间' })
    public arrowHitDelay: number = GameConstants.PLAYER_ARROW_HIT_DELAY;

    private _playerState: PlayerState = PlayerState.Ground;
    private _playerPos: Vec3 = new Vec3();
    private _meleeTimer: number = 0;
    private _meleeBusy: boolean = false;
    private _towerFiring: boolean = false;
    private _pendingRangeTarget: Enemy | null = null;
    private _towersBuilt: number = 0;

    protected onLoad(): void {
        this._resolveRefs();
        EventBus.on(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
        EventBus.on(GameEvent.CMD_CREATE_HERO, this._onCreateHero, this);
        EventBus.on(GameEvent.CMD_BUILD_TOWER, this._onBuildTower, this);
        EventBus.on(GameEvent.REQUEST_MOUNT_TOWER, this._onMountTower, this);
        EventBus.on(GameEvent.REQUEST_DISMOUNT_TOWER, this._onDismountTower, this);
        EventBus.on(GameEvent.PLAYER_RANGE_HIT, this._onPlayerRangeHit, this);
        EventBus.on(GameEvent.PLAYER_MELEE_HIT, this._onPlayerMeleeHit, this);
        EventBus.on(GameEvent.PLAYER_ACTION_FINISHED, this._onPlayerActionFinished, this);
    }

    protected start(): void {
        // Systems 比 Player 先 onLoad，这里再补一次引用
        this._resolveRefs();
    }

    private _resolveRefs(): void {
        if (!this.player) {
            this.player = this.node.scene?.getComponentInChildren(PlayerController) ?? null;
        }
        if (!this.spawner) {
            this.spawner = this.node.scene?.getComponentInChildren(EnemySpawner) ?? null;
        }
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
        EventBus.off(GameEvent.CMD_CREATE_HERO, this._onCreateHero, this);
        EventBus.off(GameEvent.CMD_BUILD_TOWER, this._onBuildTower, this);
        EventBus.off(GameEvent.REQUEST_MOUNT_TOWER, this._onMountTower, this);
        EventBus.off(GameEvent.REQUEST_DISMOUNT_TOWER, this._onDismountTower, this);
        EventBus.off(GameEvent.PLAYER_RANGE_HIT, this._onPlayerRangeHit, this);
        EventBus.off(GameEvent.PLAYER_MELEE_HIT, this._onPlayerMeleeHit, this);
        EventBus.off(GameEvent.PLAYER_ACTION_FINISHED, this._onPlayerActionFinished, this);
    }

    protected update(dt: number): void {
        this._resolveRefs();
        if (!this.spawner || !this.player) {
            return;
        }
        // 直接读玩家世界坐标，避免仅依赖事件缓存导致判空
        const wp = this.player.worldPos;
        this._playerPos.set(wp.x, wp.y, 0);
        this._playerState = this.player.state;

        if (this._playerState === PlayerState.Ground) {
            this._meleeTimer -= dt;
            if (this._meleeTimer <= 0) {
                this._tryMelee();
            }
        } else if (this._playerState === PlayerState.OnTower) {
            this._tryTowerShot();
        }
    }

    private _onPlayerState(data: PlayerStatePayload): void {
        this._playerState = data.state;
        this._playerPos.set(data.worldPos.x, data.worldPos.y, 0);
        if (data.state !== PlayerState.OnTower) {
            this._pendingRangeTarget = null;
            this._towerFiring = false;
        }
        if (data.state !== PlayerState.Ground) {
            this._meleeBusy = false;
        }
    }

    private _onPlayerActionFinished(data: PlayerActionFinishedPayload): void {
        // 资源名对调：rangeAttack clip=近战视觉，meleeAttack clip=射箭视觉
        if (data.clip === 'meleeAttack') {
            this._towerFiring = false;
            this._pendingRangeTarget = null;
        }
        if (data.clip === 'rangeAttack') {
            this._meleeBusy = false;
        }
    }

    private _tryMelee(): void {
        if (!this.spawner || !this.player || this._meleeBusy || this.player.isActionBusy) {
            return;
        }
        const targets = this.spawner.findInRadius(this._playerPos, this.meleeRadius);
        if (targets.length === 0) {
            return;
        }
        this._meleeTimer = this.meleeCooldown;
        this._meleeBusy = true;
        try {
            this.player.playMeleeAttack();
        } catch (e) {
            this._meleeBusy = false;
            console.warn('[DefenseCombat] playMeleeAttack failed', e);
        }
    }

    /** 近战 clip 帧事件：圆形范围内所有敌人 */
    private _onPlayerMeleeHit(): void {
        if (!this.spawner) {
            return;
        }
        const targets = this.spawner.findInRadius(this._playerPos, this.meleeRadius);
        for (const t of targets) {
            if (t.alive) {
                t.kill(false);
            }
        }
    }

    private _tryTowerShot(): void {
        if (
            this._towerFiring ||
            !this.spawner ||
            !this.player ||
            this.player.isActionBusy
        ) {
            return;
        }
        const target = this.spawner.findNearest(this._playerPos);
        if (!target) {
            return;
        }
        this._towerFiring = true;
        this._pendingRangeTarget = target;
        this.player.playRangeAttack();
    }

    /** 射箭 clip 帧事件（onMeleeHit）：生成箭矢，命中时再结算伤害 */
    private _onPlayerRangeHit(): void {
        const target = this._pendingRangeTarget;
        this._pendingRangeTarget = null;
        if (!target?.isValid) {
            return;
        }
        if (!this.arrowPrefab) {
            if (target.alive) {
                target.kill(false);
            }
            return;
        }
        const arrow = instantiate(this.arrowPrefab);
        arrow.parent = this.node;
        arrow.setWorldPosition(this._playerPos.x, this._playerPos.y, 0);
        const dest = target.node.worldPosition.clone();
        const proj =
            arrow.getComponent(ProjectileMovement) ?? arrow.addComponent(ProjectileMovement);
        proj.launchTo(dest, this.arrowHitDelay, () => {
            if (target.isValid && target.alive) {
                target.kill(false);
            }
        });
    }

    /** HeroType 按下标取预制体 */
    public getHeroPrefab(type: HeroType): Prefab | null {
        return this._resolveHeroPrefab(type);
    }

    private _onCreateHero(data: CreateHeroPayload): void {
        const prefab = this.getHeroPrefab(data.heroType);
        if (!prefab) {
            console.warn(
                `[DefenseCombat] heroPrefabs[${data.heroType}] 未绑定。数组须按 HeroType 下标填满：0冰柱 1风暴 2雷电 3火箭（当前 length=${this.heroPrefabs?.length ?? 0}）`,
            );
            return;
        }
        const parent = this.heroRoot ?? this.node;
        const node = instantiate(prefab);
        node.parent = parent;
        node.active = true;

        const towers = this.node.scene?.getComponentsInChildren(ArrowTower) ?? [];
        const tower = towers.find((t) => t.towerId === data.towerId) ?? null;
        const depositId = tower?.convertHeroPurchaseToMeatDeposit() ?? `${data.towerId}_meat_deposit`;

        if (tower) {
            const stand =
                tower.heroStandPoint ??
                tower.node.getChildByName('StandPoint') ??
                tower.node.getChildByName('HeroStand');
            if (stand) {
                const wp = stand.worldPosition;
                node.setWorldPosition(wp.x, wp.y, 0);
            } else {
                const wp = tower.node.worldPosition;
                node.setWorldPosition(wp.x + 40, wp.y, 0);
            }
        }

        const hero = node.getComponent(Hero) ?? node.addComponent(Hero);
        hero.heroType = data.heroType;
        hero.depositId = depositId;
        hero.spawner = this.spawner;
        if (this.heroSkillBounds) {
            hero.skillBounds = this.heroSkillBounds;
        }
        if (!hero.wavePrefab && this.defaultHeroWavePrefab) {
            hero.wavePrefab = this.defaultHeroWavePrefab;
        }
        if (!hero.skillPrefab && this.defaultHeroSkillPrefab) {
            hero.skillPrefab = this.defaultHeroSkillPrefab;
        }
        HeroCdUI.attachTo(hero);
        EventBus.emit(GameEvent.HERO_CREATED, data);
    }

    /** HeroType 按下标取预制体；下标未绑时按预制体上 Hero.heroType 匹配 */
    private _resolveHeroPrefab(type: HeroType): Prefab | null {
        const list = this.heroPrefabs || [];
        if (list[type]) {
            return list[type];
        }
        for (const p of list) {
            if (!p) {
                continue;
            }
            const temp = instantiate(p);
            const h = temp.getComponent(Hero) ?? temp.getComponentInChildren(Hero);
            const matched = h && h.heroType === type;
            temp.destroy();
            if (matched) {
                return p;
            }
        }
        return null;
    }

    private _onBuildTower(_data: { towerId: string; isExpand?: boolean }): void {
        // 建造表现与通关由 ArrowTower 响应 CMD_BUILD_TOWER 处理
    }

    private _onMountTower(data: { towerNode: Node }): void {
        if (!this.player || !data.towerNode) {
            return;
        }
        if (!this.player.canMountTower) {
            return;
        }
        const tower =
            data.towerNode.getComponent(ArrowTower) ??
            data.towerNode.getComponentInChildren(ArrowTower) ??
            data.towerNode.parent?.getComponent(ArrowTower) ??
            null;
        if (tower && (!tower.built || tower.hasHero)) {
            return;
        }
        const trigger =
            data.towerNode.getComponentInChildren(TowerMountTrigger) ??
            data.towerNode.getComponent(TowerMountTrigger) ??
            data.towerNode.parent?.getComponentInChildren(TowerMountTrigger) ??
            null;
        const stand =
            trigger?.standPoint ??
            tower?.heroStandPoint ??
            data.towerNode.getChildByName('StandPoint') ??
            data.towerNode.parent?.getChildByName('StandPoint');
        if (!stand) {
            return;
        }
        const mountRoot = tower?.node ?? trigger?.towerRoot ?? data.towerNode;
        this.player.mountTower(mountRoot, stand.worldPosition);
    }

    private _onDismountTower(data: { towerNode?: Node }): void {
        if (!this.player || this.player.state !== PlayerState.OnTower) {
            return;
        }
        const root = data.towerNode ?? null;
        const trigger =
            root?.getComponentInChildren(TowerMountTrigger) ??
            root?.getComponent(TowerMountTrigger) ??
            root?.parent?.getComponentInChildren(TowerMountTrigger) ??
            null;
        const ground =
            trigger?.groundPoint ??
            root?.getChildByName('GroundPoint') ??
            root?.parent?.getChildByName('GroundPoint') ??
            null;
        if (ground) {
            this.player.dismountTower(ground.worldPosition);
            return;
        }
        const p = this.player.node.worldPosition;
        this.player.dismountTower(new Vec3(p.x, p.y - 40, 0));
    }
}
