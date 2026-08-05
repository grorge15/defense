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
 * - 无英雄时，玩家踩到 GroundPoint → 上到 StandPoint 射箭
 * - 塔上再推摇杆 → 落回 GroundPoint
 */
@ccclass('TowerMountTrigger')
export class TowerMountTrigger extends Component {
    @property({ type: Node, tooltip: '所属箭塔根节点' })
    public towerRoot: Node | null = null;

    @property({ type: Node, tooltip: '玩家登上后站立点 StandPoint' })
    public standPoint: Node | null = null;

    @property({ type: Node, tooltip: '上塔触发 / 下塔落地点 GroundPoint' })
    public groundPoint: Node | null = null;

    private _groundCol: Collider2D | null = null;

    protected onLoad(): void {
        this._autoBind();
        this._setupGroundSensor();
        // MountTrigger 本体若带碰撞且不是 GroundPoint，关掉以免路过误上塔
        if (this.node !== this.groundPoint) {
            const selfCol = this.getComponent(Collider2D);
            if (selfCol) {
                selfCol.enabled = false;
            }
        }
    }

    protected onDestroy(): void {
        if (this._groundCol) {
            this._groundCol.off(Contact2DType.BEGIN_CONTACT, this._onGroundEnter, this);
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
        if (!this.groundPoint) {
            this.groundPoint = this.node;
        }
    }

    private _setupGroundSensor(): void {
        const gp = this.groundPoint;
        if (!gp) {
            return;
        }
        let rb = gp.getComponent(RigidBody2D);
        if (!rb) {
            rb = gp.addComponent(RigidBody2D);
            rb.type = ERigidBody2DType.Kinematic;
            rb.gravityScale = 0;
            rb.allowSleep = false;
        }
        let col = gp.getComponent(BoxCollider2D);
        if (!col) {
            col = gp.addComponent(BoxCollider2D);
            col.size = new Size(60, 60);
        }
        col.sensor = true;
        col.enabled = true;
        this._groundCol = col;
        col.on(Contact2DType.BEGIN_CONTACT, this._onGroundEnter, this);
    }

    private _onGroundEnter(_self: Collider2D, other: Collider2D): void {
        const player =
            other.getComponent(PlayerController) ??
            other.node.getComponent(PlayerController);
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
        EventBus.emit(GameEvent.REQUEST_MOUNT_TOWER, {
            towerNode: this.towerRoot ?? this.node,
        });
    }

    private _resolveTower(): ArrowTower | null {
        const root = this.towerRoot ?? this.node.parent;
        return root?.getComponent(ArrowTower) ?? root?.getComponentInChildren(ArrowTower) ?? null;
    }
}
