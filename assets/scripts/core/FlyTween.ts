import { tween, Vec3, Node, Tween } from 'cc';
import { GameConstants } from './GameConstants';

/**
 * 道具抛物线飞行：先飞到目标上方再落下。
 */
export function flyResourceTo(
    node: Node,
    targetWorldPos: Vec3,
    duration: number = GameConstants.FLY_DURATION,
    arcHeight: number = GameConstants.FLY_ARC_HEIGHT,
    onComplete?: () => void,
): Tween<Node> {
    const start = node.worldPosition.clone();
    const mid = new Vec3(
        (start.x + targetWorldPos.x) * 0.5,
        Math.max(start.y, targetWorldPos.y) + arcHeight,
        0,
    );
    const end = targetWorldPos.clone();
    end.z = 0;

    return tween(node)
        .to(duration * 0.5, { worldPosition: mid }, { easing: 'sineOut' })
        .to(duration * 0.5, { worldPosition: end }, { easing: 'sineIn' })
        .call(() => {
            onComplete?.();
        })
        .start();
}
