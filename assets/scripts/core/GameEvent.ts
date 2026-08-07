import { EventTarget } from 'cc';
import { ExpandSide, HeroType, PlayerState, ResourceType, ShopItemType } from './Enums';

/**
 * 跨系统事件名。强制通过 EventBus 解耦，避免系统间直接引用。
 */
export const GameEvent = {
    // 玩家控制系统 → 外
    PLAYER_MOVED: 'player-moved',
    PLAYER_STATE_CHANGED: 'player-state-changed',
    PLAYER_FIRST_MOVE: 'player-first-move',
    REQUEST_PICKUP_RESOURCE: 'request-pickup-resource',
    REQUEST_PLAYER_DELIVER_STALL: 'request-player-deliver-stall',
    REQUEST_MOUNT_TOWER: 'request-mount-tower',
    REQUEST_DISMOUNT_TOWER: 'request-dismount-tower',
    /** 玩家 rangeAttack 动画帧事件 → 防守系统结算远程伤害 */
    PLAYER_RANGE_HIT: 'player-range-hit',
    /** 玩家近战 clip 帧事件 → 圆形范围伤害 */
    PLAYER_MELEE_HIT: 'player-melee-hit',
    /** 玩家动作 clip 播完（idle/run 恢复前） */
    PLAYER_ACTION_FINISHED: 'player-action-finished',

    // 防守战斗系统 → 外
    ENEMY_DIED: 'enemy-died',
    WALL_HP_CHANGED: 'wall-hp-changed',
    HERO_CREATED: 'hero-created',
    TOWER_BUILT: 'tower-built',
    GAME_CLEARED: 'game-cleared',

    // 资源经济系统 → 外
    COIN_CHANGED: 'coin-changed',
    RESOURCE_PICKED: 'resource-picked',
    RESOURCE_DELIVERED: 'resource-delivered',
    STALL_STOCK_CHANGED: 'stall-stock-changed',
    DEPOSIT_STOCK_CHANGED: 'deposit-stock-changed',

    // NPC AI → 资源经济
    NPC_REQUEST_PICKUP: 'npc-request-pickup',
    NPC_REQUEST_DELIVER: 'npc-request-deliver',

    // 商店 → 对应系统（只发指令，不直接创建）
    SHOP_PURCHASE_SUCCESS: 'shop-purchase-success',
    REQUEST_SPEND_COIN: 'request-spend-coin',
    SPEND_COIN_RESULT: 'spend-coin-result',
    CMD_CREATE_HERO: 'cmd-create-hero',
    CMD_CREATE_HELPER: 'cmd-create-helper',
    CMD_CREATE_LUMBERJACK: 'cmd-create-lumberjack',
    CMD_CREATE_STALL: 'cmd-create-stall',
    CMD_UNLOCK_EXPAND: 'cmd-unlock-expand',
    CMD_BUILD_TOWER: 'cmd-build-tower',

    // 场景地块 → 资源经济
    TREE_CHOPPED: 'tree-chopped',
    EXPAND_UNLOCKED: 'expand-unlocked',

    // UI / 引导
    GUIDE_PHASE_CHANGED: 'guide-phase-changed',
    OPEN_HERO_SELECT: 'open-hero-select',
    HERO_SELECTED: 'hero-selected',
} as const;

export type GameEventName = (typeof GameEvent)[keyof typeof GameEvent];

/** 怪物死亡载荷：英雄击杀自动入库，玩家击杀落地 */
export interface EnemyDiedPayload {
    worldPos: { x: number; y: number; z: number };
    byHero: boolean;
    heroDepositId?: string;
}

export interface PickupRequestPayload {
    requesterId: string;
    resourceType: ResourceType;
    depositId?: string;
    worldPos: { x: number; y: number; z: number };
}

export interface DeliverRequestPayload {
    requesterId: string;
    resourceType: ResourceType;
    stallId: string;
    amount: number;
}

export interface ShopPurchasePayload {
    itemType: ShopItemType;
    side?: ExpandSide;
    towerId?: string;
    /** 一次购买同时建造的其它箭塔 ID */
    extraTowerIds?: string[];
    stallId?: string;
}

export interface CreateHeroPayload {
    towerId: string;
    heroType: HeroType;
}

export interface CoinChangedPayload {
    coin: number;
    delta: number;
}

export interface PlayerStatePayload {
    state: PlayerState;
    worldPos: { x: number; y: number; z: number };
}

export interface PlayerActionFinishedPayload {
    /** 与 _playAction 传入的逻辑 clip 名一致 */
    clip: string;
}

export interface TreeChoppedPayload {
    treeId: string;
    worldPos: { x: number; y: number; z: number };
    /** 本次掉落木头个数（默认 1） */
    amount?: number;
}

/** 全局事件总线（EventTarget 单例封装） */
export class EventBus {
    private static _bus: EventTarget = new EventTarget();

    public static on<T = any>(event: GameEventName, callback: (data: T) => void, target?: any): void {
        this._bus.on(event, callback, target);
    }

    public static once<T = any>(event: GameEventName, callback: (data: T) => void, target?: any): void {
        this._bus.once(event, callback, target);
    }

    public static off<T = any>(event: GameEventName, callback?: (data: T) => void, target?: any): void {
        this._bus.off(event, callback, target);
    }

    public static emit<T = any>(event: GameEventName, data?: T): void {
        this._bus.emit(event, data);
    }

    public static clear(): void {
        this._bus = new EventTarget();
    }
}
