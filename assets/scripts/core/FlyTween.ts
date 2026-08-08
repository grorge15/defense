import { tween, Vec3, Node, Tween } from 'cc';
import { GameConstants } from './GameConstants';

/** 固定点，或持续追踪的节点（如移动中的 CarryRoot） */
export type FlyTarget = Vec3 | Node;

function _isNodeTarget(target: FlyTarget): target is Node {
    return typeof (target as Node).isValid === 'boolean' && 'worldPosition' in target;
}

function _readTarget(target: FlyTarget, out: Vec3): Vec3 {
    if (_isNodeTarget(target)) {
        if (target.isValid) {
            const wp = target.worldPosition;
            out.set(wp.x, wp.y, 0);
        }
        return out;
    }
    out.set(target.x, target.y, 0);
    return out;
}

function _sineOut(u: number): number {
    return Math.sin((u * Math.PI) / 2);
}

function _sineIn(u: number): number {
    return 1 - Math.cos((u * Math.PI) / 2);
}

function _lerp(a: Vec3, b: Vec3, t: number, out: Vec3): Vec3 {
    out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0);
    return out;
}

/**
 * 道具抛物线飞行：先飞到目标上方再落下。
 * target 传 Node 时全程追踪其 worldPosition（适配玩家移动中的 CarryRoot）。
 */
export function flyResourceTo(
    node: Node,
    target: FlyTarget,
    duration: number = GameConstants.FLY_DURATION,
    arcHeight: number = GameConstants.FLY_ARC_HEIGHT,
    onComplete?: () => void,
): Tween<{ k: number }> {
    const start = node.worldPosition.clone();
    start.z = 0;
    const end = new Vec3();
    const mid = new Vec3();
    const pos = new Vec3();
    _readTarget(target, end);

    const progress = { k: 0 };
    const dur = Math.max(0.01, duration);

    return tween(progress)
        .to(
            dur,
            { k: 1 },
            {
                onUpdate: () => {
                    if (!node.isValid) {
                        return;
                    }
                    _readTarget(target, end);
                    mid.set(
                        (start.x + end.x) * 0.5,
                        Math.max(start.y, end.y) + arcHeight,
                        0,
                    );
                    const k = progress.k;
                    if (k < 0.5) {
                        _lerp(start, mid, _sineOut(k / 0.5), pos);
                    } else {
                        _lerp(mid, end, _sineIn((k - 0.5) / 0.5), pos);
                    }
                    node.setWorldPosition(pos.x, pos.y, 0);
                },
            },
        )
        .call(() => {
            if (node.isValid) {
                _readTarget(target, end);
                node.setWorldPosition(end.x, end.y, 0);
            }
            onComplete?.();
        })
        .start();
}
