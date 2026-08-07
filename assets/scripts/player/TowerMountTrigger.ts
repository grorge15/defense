import {
    _decorator,
    Component,
    Node,
    Collider2D,
    BoxCollider2D,
    Contact2DType,
    Size,
    RigidBody2D,
    ERigidBody2DType,
} from 'cc';
import { EventBus, GameEvent } from '../core/GameEvent';
import { PlayerController } from './PlayerController';
import { ArrowTower } from '../combat/ArrowTower';

const { ccclass, property } = _decorator;

/**
 * 箭塔登/下塔：
 * - GroundPoint 仅作落点标记，不带刚体/碰撞
 * - 传感器在 MountTrigger 上，运行时对齐 GroundPoint 位置
 * - 无英雄时踩传感器 → StandPoint 射箭
 */
@ccclass('TowerMountTrigger')
export class TowerMountTrigger extends Component {
    @property({ type: Node, tooltip: '所属箭塔根节点' })
    public towerRoot: Node | null = null;

    @property({ type: Node, tooltip: '玩家登上后站立点 StandPoint' })
    public standPoint: Node | null = null;

    @property({ type: Node, tooltip: '上塔触发参考 / 下塔落地点 GroundPoint（无物理）' })
    public groundPoint: Node | null = null;

    @property({ tooltip: '传感器尺寸（MountTrigger BoxCollider2D）' })
    public sensorSize: number = 60;

    private _sensorCol: Collider2D | null = null;

    protected onLoad(): void {
        this._autoBind();
        this._stripGroundPointPhysics();
        this._syncTriggerToGround();
        this._setupMountSensor();
    }

    protected onDestroy(): void {
        if (this._sensorCol) {
            this._sensorCol.off(Contact2DType.BEGIN_CONTACT, this._onGroundEnter, this);
        }
    }

    private _autoBind(): void {
        if (!this.towerRoot) {
            this.towerRoot = this.node.parent;
        }
        if (!this.standPoint && this.towerRoot) {
            this.standPoint =
                this.towerRoot.getChildByName('StandPoint') ??
                this.towerRoot.getChildByName('HeroStand');
        }
        if (!this.groundPoint && this.towerRoot) {
            this.groundPoint = this.towerRoot.getChildByName('GroundPoint');
        }
    }

    /** GroundPoint 只做标记，移除运行时误挂的刚体/碰撞 */
    private _stripGroundPointPhysics(): void {
        const gp = this.groundPoint;
        if (!gp || gp === this.node) {
            return;
        }
        const rb = gp.getComponent(RigidBody2D);
        if (rb) {
            rb.destroy();
        }
        const col = gp.getComponent(Collider2D);
        if (col) {
            col.destroy();
        }
    }

    /** MountTrigger 传感器对齐到 GroundPoint 世界位置 */
    private _syncTriggerToGround(): void {
        if (!this.groundPoint || this.groundPoint === this.node) {
            return;
        }
        const wp = this.groundPoint.worldPosition;
        this.node.setWorldPosition(wp.x, wp.y, wp.z);
    }

    /** 传感器挂在 MountTrigger 本节点，不给 GroundPoint 加刚体 */
    private _setupMountSensor(): void {
        let rb = this.node.getComponent(RigidBody2D);
        if (!rb) {
            rb = this.node.addComponent(RigidBody2D);
        }
        rb.type = ERigidBody2DType.Kinematic;
        rb.gravityScale = 0;
        rb.allowSleep = false;
        rb.enabledContactListener = true;

        let col = this.node.getComponent(BoxCollider2D);
        if (!col) {
            col = this.node.addComponent(BoxCollider2D);
        }
        const s = Math.max(20, this.sensorSize);
        col.size = new Size(s, s);
        col.sensor = true;
        col.enabled = true;

        if (this._sensorCol && this._sensorCol !== col) {
            this._sensorCol.off(Contact2DType.BEGIN_CONTACT, this._onGroundEnter, this);
        }
        this._sensorCol = col;
        col.on(Contact2DType.BEGIN_CONTACT, this._onGroundEnter, this);
    }

    private _onGroundEnter(_self: Collider2D, other: Collider2D): void {
        const player = this._findPlayer(other);
        if (!player || !player.canMountTower) {
            return;
        }
        const tower = this._resolveTower();
        if (tower && !tower.built) {
            return;
        }
        if (tower?.hasHero) {
            return;
        }
        if (!this.standPoint) {
            console.warn('[TowerMountTrigger] StandPoint 未绑定', this.node.name);
            return;
        }
        EventBus.emit(GameEvent.REQUEST_MOUNT_TOWER, {
            towerNode: this.towerRoot ?? this.node.parent ?? this.node,
        });
    }

    private _findPlayer(col: Collider2D): PlayerController | null {
        let n: Node | null = col.node;
        for (let i = 0; i < 4 && n; i++) {
            const p = n.getComponent(PlayerController);
            if (p) {
                return p;
            }
            n = n.parent;
        }
        return null;
    }

    private _resolveTower(): ArrowTower | null {
        const root = this.towerRoot ?? this.node.parent;
        return root?.getComponent(ArrowTower) ?? root?.getComponentInChildren(ArrowTower) ?? null;
    }
}
