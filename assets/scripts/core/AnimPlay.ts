import { Animation, AnimationState } from 'cc';

/**
 * 解析并确保存在以逻辑名（idle/run/walk…）注册的 AnimationState。
 * Cocos 常把资源文件名当作 clip.name（如 Player_run），而脚本 play('run')。
 */
export function resolveAnimState(anim: Animation, logical: string): AnimationState | null {
    if (!anim || !logical) {
        return null;
    }
    const existing = anim.getState(logical);
    if (existing) {
        return existing;
    }
    const clips = anim.clips;
    if (!clips?.length) {
        return null;
    }
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        if (!clip) {
            continue;
        }
        const n = clip.name || '';
        if (n === logical || n.endsWith(`_${logical}`)) {
            try {
                return anim.createState(clip, logical);
            } catch {
                return anim.getState(n) ?? null;
            }
        }
    }
    return null;
}

/** 按逻辑名播放；必要时 createState 别名。返回实际 state。 */
export function playAnimClip(
    anim: Animation | null | undefined,
    logical: string,
    opts?: { restart?: boolean },
): AnimationState | null {
    if (!anim) {
        return null;
    }
    const state = resolveAnimState(anim, logical);
    if (!state) {
        console.warn(
            `[AnimPlay] clip '${logical}' not found; have:`,
            anim.clips?.map((c) => c?.name),
        );
        return null;
    }
    if (!opts?.restart && state.isPlaying) {
        return state;
    }
    anim.play(state.name);
    return state;
}
