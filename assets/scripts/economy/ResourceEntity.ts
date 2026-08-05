import { _decorator, Component, Enum } from 'cc';
import { ResourceType } from '../core/Enums';

const { ccclass, property } = _decorator;

/** 场景中的可拾取资源实体 */
@ccclass('ResourceEntity')
export class ResourceEntity extends Component {
    @property({ type: Enum(ResourceType), tooltip: '资源类型' })
    public resourceType: ResourceType = ResourceType.RawMeat;

    @property({ tooltip: '结算单位数量（通常 1）' })
    public amount: number = 1;

    @property({ tooltip: '是否正在飞行中（飞行中不可拾取）' })
    public flying: boolean = false;

    public entityId: string = '';

    protected onLoad(): void {
        if (!this.entityId) {
            this.entityId = `res_${this.node.uuid}`;
        }
    }
}
