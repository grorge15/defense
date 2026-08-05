import { ResourceType, ShopItemType } from './Enums';

/** 全局硬编码数值（规格要求：无需配置表，直接写死） */
export class GameConstants {
    // —— 初始 ——
    public static readonly PLAYER_INIT_COIN = 30;
    public static readonly MAX_ENEMY_COUNT = 30;
    public static readonly JOYSTICK_IDLE_HINT_SEC = 3;

    // —— 资源：模型数量与结算金币 ——
    public static readonly RESOURCE_MODEL_COUNT: Record<ResourceType, number> = {
        [ResourceType.RawMeat]: 1,
        [ResourceType.CookedMeat]: 2,
        [ResourceType.Wood]: 4,
        [ResourceType.Coin]: 1,
    };

    public static readonly RESOURCE_COIN_VALUE: Record<ResourceType, number> = {
        [ResourceType.RawMeat]: 3,
        [ResourceType.CookedMeat]: 6,
        [ResourceType.Wood]: 12,
        [ResourceType.Coin]: 1,
    };

    // —— 商店定价 ——
    public static readonly SHOP_PRICE: Record<ShopItemType, number> = {
        [ShopItemType.ArrowTower]: 30,
        [ShopItemType.MeatHelper]: 60,
        [ShopItemType.Hero]: 60,
        [ShopItemType.CookedMeatStall]: 120,
        [ShopItemType.ExpandArea]: 180,
        [ShopItemType.Lumberjack]: 100,
        [ShopItemType.ExpandTower]: 200,
    };

    // —— 引导阈值 ——
    public static readonly GUIDE_HELPER_COIN_THRESHOLD = 60;

    // —— 顾客（预留可调） ——
    public static readonly CUSTOMER_QUEUE_MAX = 10;
    public static readonly CUSTOMER_DEMAND_MIN = 2;
    public static readonly CUSTOMER_DEMAND_MAX = 5;
    public static readonly CUSTOMER_LEAVE_ANIM_SEC = 0.8;
    public static readonly CUSTOMER_DEMAND_HARD_CAP = 10;

    // —— 战斗 ——
    public static readonly WALL_MAX_HP = 100;
    public static readonly PLAYER_MELEE_RANGE = 80;
    public static readonly PLAYER_MELEE_COOLDOWN = 0.12;
    public static readonly PLAYER_ARROW_HIT_DELAY = 0.12;
    public static readonly HERO_NORMAL_ATTACK_INTERVAL = 1.0;
    public static readonly HERO_SKILL_CD = 8;
    public static readonly HERO_SKILL_ROW_COUNT = 3;
    public static readonly HERO_SKILL_COL_COUNT = 4;
    public static readonly HERO_SKILL_CELL_SPACING = 60;
    public static readonly HERO_SKILL_START_DELAY = 0.15;

    // —— 资源堆叠表现 ——
    public static readonly CARRY_STACK_VISUAL_MAX = 10;
    public static readonly CARRY_STACK_GAP = 12;
    public static readonly CARRY_TYPE_GAP = 28;

    // —— 放置点占位数量 ——
    public static readonly DEPOSIT_SLOT_RAW_MEAT = 6;
    public static readonly DEPOSIT_SLOT_WOOD = 4;
    public static readonly DEPOSIT_SLOT_COIN = 4;
    /** 每个占位格最多竖直堆叠层数 */
    public static readonly DEPOSIT_STACK_LAYERS = 20;
    /** 金币地块经济库存上限 */
    public static readonly DEPOSIT_COIN_STOCK_CAP = 999;
    /** 放置点竖直堆叠间距（高于背负，堆叠更明显） */
    public static readonly DEPOSIT_STACK_GAP = 18;

    // —— 树木 ——
    public static readonly TREE_HIT_COUNT = 5;
    public static readonly TREE_TOTAL_COUNT = 6;
    public static readonly TREE_REGROW_PAIR = 2;
    /** 地面木头无人拾取后自动飞入 Deposit_wood 的等待秒数 */
    public static readonly WOOD_GROUND_AUTO_DEPOSIT_SEC = 2;
    public static readonly TREE_FALL_DURATION_SEC = 0.4;
    public static readonly TREE_REGROW_DURATION_SEC = 0.45;
    /** 地面木头未被拾取时，自动飞入 Deposit_wood 的等待秒数 */
    public static readonly WOOD_AUTO_DEPOSIT_SEC = 2;

    // —— 烤肉转化 ——
    public static readonly COOK_DURATION_SEC = 2.0;

    // —— 城门 ——
    public static readonly GATE_OPEN_DISTANCE = 120;

    // —— 资源拾取 ——
    public static readonly PICKUP_RANGE = 60;

    // —— 资源飞行 ——
    public static readonly FLY_ARC_HEIGHT = 80;
    public static readonly FLY_DURATION = 0.4;
    /** 摊位上交专用：极短飞行，快速卸货 */
    public static readonly STALL_DELIVER_FLY_DURATION = 0.1;
    public static readonly STALL_DELIVER_FLY_ARC = 40;
    public static readonly STALL_DELIVER_INTERVAL = 0.05;

    // —— 怪物刷新 ——
    public static readonly ENEMY_SPAWN_INTERVAL = 0.35;
    public static readonly ENEMY_MOVE_SPEED = 60;
}
