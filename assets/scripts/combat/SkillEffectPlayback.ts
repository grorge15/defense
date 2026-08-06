import { _decorator, Animation, Component } from 'cc';

const { ccclass } = _decorator;

/** 技能特效：播放默认 clip，结束后自动销毁。 */
@ccclass('SkillEffectPlayback')
export class SkillEffectPlayback extends Component {
    protected onEnable(): void {
        const anim = this.getComponent(Animation) ?? this.getComponentInChildren(Animation);
        if (!anim) {
            this.scheduleOnce(() => this.node.destroy(), 0.3);
            return;
        }
        anim.play();
        anim.once(Animation.EventType.FINISHED, () => {
            if (this.node.isValid) {
                this.node.destroy();
            }
        });
    }
}
