/** 玩家角色状态 */
export enum PlayerState {
    Ground = 0,
    OnTower = 1,
}

/** 资源类型（表现模型与经济结算对应） */
export enum ResourceType {
    RawMeat = 0,
    CookedMeat = 1,
    Wood = 2,
    Coin = 3,
}

/** 商店商品类型 */
export enum ShopItemType {
    ArrowTower = 0,
    MeatHelper = 1,
    Hero = 2,
    CookedMeatStall = 3,
    ExpandArea = 4,
    Lumberjack = 5,
    ExpandTower = 6,
}

/** 扩展区域方向 */
export enum ExpandSide {
    East = 0,
    West = 1,
}

/** NPC 工作状态 */
export enum NpcWorkState {
    Idle = 0,
    Working = 1,
}

/** 帮手行为目标 */
export enum HelperTask {
    Idle = 0,
    PickupDeposit = 1,
    TradeAtStall = 2,
}

/** 英雄类型（4 种，普攻相同，范围技能不同） */
export enum HeroType {
    IcePillar = 0,
    Storm = 1,
    Lightning = 2,
    Rocket = 3,
}

/** 英雄战斗阶段 */
export enum HeroCombatPhase {
    NormalAttack = 0,
    SkillCasting = 1,
}

/** 放置点类型 */
export enum DepositType {
    RawMeat = 0,
    Wood = 1,
    Coin = 2,
}

/** 摊位类型 */
export enum StallType {
    RawMeat = 0,
    CookedMeat = 1,
    Wood = 2,
}

/** 引导阶段 */
export enum GuidePhase {
    MoveHint = 0,
    BuildTower = 1,
    CombatAndTrade = 2,
    BuyHelper = 3,
    BuyHero = 4,
    BuyCookedStall = 5,
    ExpandArea = 6,
    Finished = 7,
}
