import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { EventBus, GameEvent, PlayerStatePayload } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';
import { Enemy } from './Enemy';

const { ccclass, property } = _decorator;

/**
 * 怪物刷新：玩家首次移动后开始；场上上限 30。
 */
@ccclass('EnemySpawner')
export class EnemySpawner extends Component {
    @property({ type: Prefab, tooltip: '怪物预制体 pref_enemy' })
    public enemyPrefab: Prefab | null = null;

    @property({ type: [Node], tooltip: '屏幕外刷新点列表' })
    public spawnPoints: Node[] = [];

    @property({ type: Node, tooltip: '怪物寻路默认目标（城墙中心等）' })
    public defaultTarget: Node | null = null;

    @property({ tooltip: '刷新间隔（秒）' })
    public spawnInterval: number = GameConstants.ENEMY_SPAWN_INTERVAL;

    @property({ tooltip: '同时在场上限' })
    public maxAlive: number = GameConstants.MAX_ENEMY_COUNT;

    private _enabledSpawn: boolean = false;
    private _timer: number = 0;
    private _alive: Enemy[] = [];
    private _playerPos: Vec3 = new Vec3();

    protected onLoad(): void {
        EventBus.on(GameEvent.PLAYER_FIRST_MOVE, this._onFirstMove, this);
        EventBus.on(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
        EventBus.on(GameEvent.ENEMY_DIED, this._onEnemyDied, this);
    }

    protected onDestroy(): void {
        EventBus.off(GameEvent.PLAYER_FIRST_MOVE, this._onFirstMove, this);
        EventBus.off(GameEvent.PLAYER_STATE_CHANGED, this._onPlayerState, this);
        EventBus.off(GameEvent.ENEMY_DIED, this._onEnemyDied, this);
    }

    protected update(dt: number): void {
        if (!this._enabledSpawn || !this.enemyPrefab) {
            return;
        }
        this._purgeDead();
        if (this._alive.length >= this.maxAlive) {
            return;
        }
        this._timer += dt;
        if (this._timer >= this.spawnInterval) {
            this._timer = 0;
            this._spawnOne();
        }
    }

    public getAliveEnemies(): Enemy[] {
        this._purgeDead();
        return this._alive;
    }

    public findNearest(from: Vec3, maxDist: number = Number.MAX_VALUE): Enemy | null {
        let best: Enemy | null = null;
        let bestD = maxDist * maxDist;
        for (const e of this.getAliveEnemies()) {
            if (!e.alive) {
                continue;
            }
            const p = e.node.worldPosition;
            const d = (p.x - from.x) ** 2 + (p.y - from.y) ** 2;
            if (d < bestD) {
                bestD = d;
                best = e;
            }
        }
        return best;
    }

    public findInRadius(center: Vec3, radius: number): Enemy[] {
        const r2 = radius * radius;
        const list: Enemy[] = [];
        for (const e of this.getAliveEnemies()) {
            if (!e.alive) {
                continue;
            }
            const p = e.node.worldPosition;
            if ((p.x - center.x) ** 2 + (p.y - center.y) ** 2 <= r2) {
                list.push(e);
            }
        }
        return list;
    }

    private _onFirstMove(): void {
        this._enabledSpawn = true;
    }

    private _onPlayerState(data: PlayerStatePayload): void {
        this._playerPos.set(data.worldPos.x, data.worldPos.y, 0);
    }

    private _onEnemyDied(): void {
        this._purgeDead();
    }

    private _purgeDead(): void {
        this._alive = this._alive.filter((e) => e && e.isValid && e.alive);
    }

    private _spawnOne(): void {
        if (!this.enemyPrefab || this.spawnPoints.length === 0) {
            return;
        }
        const point = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
        const node = instantiate(this.enemyPrefab);
        node.parent = this.node;
        const wp = point.worldPosition;
        node.setWorldPosition(wp.x, wp.y, 0);
        const enemy = node.getComponent(Enemy);
        if (enemy) {
            const target = this.defaultTarget ? this.defaultTarget.worldPosition : this._playerPos;
            enemy.setTarget(target);
            this._alive.push(enemy);
        }
    }
}
