import { _decorator, Component, EventTouch, Node, UITransform, Vec2, Vec3 } from 'cc';
import { EventBus, GameEvent } from '../core/GameEvent';
import { GameConstants } from '../core/GameConstants';

const { ccclass, property } = _decorator;

/**
 * 双摇杆 UI：
 * - hintNode：右下角固定「提示摇杆」（HintStickRoot + 手指图标 / 倒8 动画），无操作时显示
 * - stickRoot：常规摇杆，touchStart 时在手指落点显示，参与移动逻辑
 */
@ccclass('VirtualJoystick')
export class VirtualJoystick extends Component {
    @property({ type: Node, tooltip: '提示层根节点（含 HintStickRoot，固定右下角）' })
    public hintNode: Node | null = null;

    @property({ type: Node, tooltip: '常规摇杆根节点（含 Bg + Thumb），触屏时显示' })
    public stickRoot: Node | null = null;

    @property({ type: Node, tooltip: '常规摇杆背景（限制拇指范围）' })
    public bgNode: Node | null = null;

    @property({ type: Node, tooltip: '常规摇杆拇指' })
    public stickNode: Node | null = null;

    @property({ tooltip: '最大拖动半径（像素）' })
    public maxRadius: number = 80;

    @property({ tooltip: '死区半径，小于此值视为未输入' })
    public deadZone: number = 8;

    @property({ tooltip: '无操作多久后重新显示提示摇杆（秒）' })
    public idleHintSeconds: number = GameConstants.JOYSTICK_IDLE_HINT_SEC;

    private _dir: Vec2 = new Vec2(0, 0);
    private _touching: boolean = false;
    private _idleTimer: number = 0;
    private _hasMovedOnce: boolean = false;
    private _inputLocked: boolean = false;

    public get direction(): Readonly<Vec2> {
        return this._dir;
    }

    public get isTouching(): boolean {
        return this._touching;
    }

    public get hasMovedOnce(): boolean {
        return this._hasMovedOnce;
    }

    public get idleSeconds(): number {
        return this._idleTimer;
    }

    /** 通关后锁定摇杆输入 */
    public setInputLocked(locked: boolean): void {
        this._inputLocked = locked;
        if (locked) {
            this._touching = false;
            this._dir.set(0, 0);
            if (this.stickRoot) {
                this.stickRoot.active = false;
            }
            if (this.stickNode) {
                this.stickNode.setPosition(0, 0, 0);
            }
        }
    }

    protected onLoad(): void {
        this._showHint();
    }

    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    protected update(dt: number): void {
        if (this._touching) {
            this._idleTimer = 0;
            return;
        }
        this._idleTimer += dt;
        if (this._idleTimer >= this.idleHintSeconds) {
            this._showHint();
        }
    }

    private _showHint(): void {
        if (this.hintNode) {
            this.hintNode.active = true;
        }
        if (this.stickRoot && !this._touching) {
            this.stickRoot.active = false;
        }
    }

    private _hideHint(): void {
        if (this.hintNode) {
            this.hintNode.active = false;
        }
    }

    private _onTouchStart(e: EventTouch): void {
        if (this._inputLocked) {
            return;
        }
        this._touching = true;
        this._idleTimer = 0;
        this._hideHint();

        if (this.stickRoot) {
            this.stickRoot.active = true;
        }

        const parentUi = this.node.getComponent(UITransform);
        if (parentUi && this.stickRoot) {
            const loc = e.getUILocation();
            const localPos = parentUi.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
            this.stickRoot.setPosition(localPos);
        }

        if (this.stickNode) {
            this.stickNode.setPosition(0, 0, 0);
        }
        this._dir.set(0, 0);

        EventBus.emit(GameEvent.PLAYER_MOVED);
    }

    private _onTouchMove(e: EventTouch): void {
        if (this._inputLocked || !this.bgNode) {
            return;
        }
        const ui = this.bgNode.getComponent(UITransform);
        if (!ui) {
            return;
        }
        const loc = e.getUILocation();
        const local = ui.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        const len = Math.sqrt(local.x * local.x + local.y * local.y);
        if (len < this.deadZone) {
            this._dir.set(0, 0);
            if (this.stickNode) {
                this.stickNode.setPosition(0, 0, 0);
            }
            return;
        }
        const clamped = Math.min(len, this.maxRadius);
        const nx = (local.x / len) * clamped;
        const ny = (local.y / len) * clamped;
        if (this.stickNode) {
            this.stickNode.setPosition(nx, ny, 0);
        }
        this._dir.set(nx / this.maxRadius, ny / this.maxRadius);

        if (!this._hasMovedOnce && this._dir.lengthSqr() > 0.01) {
            this._hasMovedOnce = true;
            EventBus.emit(GameEvent.PLAYER_FIRST_MOVE);
        }
    }

    private _onTouchEnd(): void {
        this._touching = false;
        this._dir.set(0, 0);
        if (this.stickNode) {
            this.stickNode.setPosition(0, 0, 0);
        }
        if (this.stickRoot) {
            this.stickRoot.active = false;
        }
        this._idleTimer = 0;
    }
}
