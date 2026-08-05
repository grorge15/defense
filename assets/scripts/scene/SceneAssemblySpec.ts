/**
 * Main 场景装配规格（审阅用）
 * ---------------------------------
 * 用途：描述 Main.scene 的节点树、组件挂载、引用绑定。
 * 确认无误后，再由 MCP 按本文件执行场景装载。
 *
 * 设计分辨率：720 × 1280（竖屏）
 * 坐标约定：XY 平面，Z = 0；透视层级用 SortingOrder2D（-worldY）
 */

/** 场景资产路径 */
export const SCENE_PATH = 'db://assets/scenes/Main.scene';

/** 节点路径常量（相对于场景根） */
export const SceneNodePath = {
    // —— UI 层（Canvas 下，layer = UI_2D） ——
    Canvas: 'Canvas',
    Camera: 'Canvas/Camera',
    UI: 'Canvas/UI',
    Hud: 'Canvas/UI/Hud',
    Joystick: 'Canvas/UI/Joystick',
    HeroSelect: 'Canvas/UI/HeroSelect',
    Guide: 'Canvas/UI/Guide',

    // —— 游戏世界层（GameRoot 下，layer = DEFAULT） ——
    GameRoot: 'GameRoot',
    Systems: 'GameRoot/Systems',
    Combat: 'GameRoot/Systems/Combat',
    Economy: 'GameRoot/Systems/Economy',
    NpcAi: 'GameRoot/Systems/NpcAi',
    Shop: 'GameRoot/Systems/Shop',
    SceneTiles: 'GameRoot/Systems/SceneTiles',
    World: 'GameRoot/World',
    EnemySpawner: 'GameRoot/World/EnemySpawner',
    Wall: 'GameRoot/World/Wall',
    Gate: 'GameRoot/World/Gate',
    Player: 'GameRoot/Player',

    // —— 世界子区域（MCP 第二阶段创建，初始可先 inactive） ——
    City: 'GameRoot/World/City',
    Stalls: 'GameRoot/World/City/Stalls',
    Deposits: 'GameRoot/World/City/Deposits',
    Towers: 'GameRoot/World/City/Towers',
    Purchases: 'GameRoot/World/City/Purchases',
    ExpandEast: 'GameRoot/World/ExpandEast',
    ExpandWest: 'GameRoot/World/ExpandWest',
    Trees: 'GameRoot/World/ExpandEast/Trees',
} as const;

/** 组件挂载表：节点路径 → 组件类名 */
export const ComponentMountTable: Record<string, string[]> = {
    [SceneNodePath.GameRoot]: ['GameManager'],
    [SceneNodePath.Combat]: ['DefenseCombatSystem'],
    [SceneNodePath.Economy]: ['ResourceEconomySystem'],
    [SceneNodePath.NpcAi]: ['NpcAiSystem'],
    [SceneNodePath.Shop]: ['ShopSystem'],
    [SceneNodePath.SceneTiles]: ['SceneTileSystem'],
    [SceneNodePath.Player]: ['PlayerController', 'PlayerCarryStack', 'RigidBody2D', 'BoxCollider2D'],
    [SceneNodePath.EnemySpawner]: ['EnemySpawner'],
    [SceneNodePath.Wall]: ['Wall', 'BoxCollider2D'],
    [SceneNodePath.Gate]: ['Gate'],
    [SceneNodePath.Hud]: ['HudResourceUI'],
    [SceneNodePath.Joystick]: ['VirtualJoystick', 'UITransform'],
    [SceneNodePath.HeroSelect]: ['HeroSelectUI', 'UITransform'],
    [SceneNodePath.Guide]: ['TutorialGuide', 'UITransform'],
};

/**
 * 引用绑定表（审阅重点）
 * key = "组件所在节点路径/组件类名"
 * value = { 属性名: 目标节点路径 或 目标组件路径 }
 *
 * 组件路径格式：节点路径/组件类名
 */
export const ReferenceBindingTable: Record<string, Record<string, string>> = {
  // GameManager
  'GameRoot/GameManager': {
    player: 'GameRoot/Player/PlayerController',
    combat: 'GameRoot/Systems/Combat/DefenseCombatSystem',
    economy: 'GameRoot/Systems/Economy/ResourceEconomySystem',
    npcAi: 'GameRoot/Systems/NpcAi/NpcAiSystem',
    shop: 'GameRoot/Systems/Shop/ShopSystem',
    sceneTiles: 'GameRoot/Systems/SceneTiles/SceneTileSystem',
    guide: 'Canvas/UI/Guide/TutorialGuide',
  },

  // 玩家
  'GameRoot/Player/PlayerController': {
    joystick: 'Canvas/UI/Joystick/VirtualJoystick',
    carryStack: 'GameRoot/Player/PlayerCarryStack',
  },
  'GameRoot/Player/PlayerCarryStack': {
    carryRoot: 'GameRoot/Player/CarryRoot', // 子节点，MCP 第二阶段创建
  },

  // 战斗
  'GameRoot/Systems/Combat/DefenseCombatSystem': {
    spawner: 'GameRoot/World/EnemySpawner/EnemySpawner',
    player: 'GameRoot/Player/PlayerController',
    heroRoot: 'GameRoot/World/City/Towers',
  },

  // 经济
  'GameRoot/Systems/Economy/ResourceEconomySystem': {
    playerCarry: 'GameRoot/Player/PlayerCarryStack',
    dropRoot: 'GameRoot/World/Drops',
    deposits: '（数组）GameRoot/World/City/Deposits 下全部 DepositPoint',
    stalls: '（数组）GameRoot/World/City/Stalls 下全部 Stall',
    rawMeatPrefab: 'db://assets/resources/prefabs/pref_meat',
    woodPrefab: 'db://assets/resources/prefabs/pref_wood',
    cookedMeatPrefab: 'db://assets/resources/prefabs/pref_cooked_meat',
  },

  // NPC
  'GameRoot/Systems/NpcAi/NpcAiSystem': {
    npcRoot: 'GameRoot/World/Npcs',
    defaultMeatStall: 'GameRoot/World/City/Stalls/Stall_RawMeat/Stall',
    defaultMeatDeposit: 'GameRoot/World/City/Deposits/Deposit_RawMeat/DepositPoint',
    trees: '（数组）GameRoot/World/ExpandEast/Trees 下全部 TreeEntity',
    helperPrefab: 'db://assets/resources/prefabs/pref_helper',
    lumberjackPrefab: 'db://assets/resources/prefabs/pref_lumberjack',
  },

  // UI
  'Canvas/UI/Hud/HudResourceUI': {
    coinLabel: 'Canvas/UI/Hud/CoinLabel',
    meatLabel: 'Canvas/UI/Hud/MeatLabel',
    carry: 'GameRoot/Player/PlayerCarryStack',
  },
  'Canvas/UI/Joystick/VirtualJoystick': {
    hintNode: 'Canvas/UI/Joystick/Hint',
    stickRoot: 'Canvas/UI/Joystick/StickRoot',
    bgNode: 'Canvas/UI/Joystick/StickRoot/Bg',
    stickNode: 'Canvas/UI/Joystick/StickRoot/Thumb',
  },
  'Canvas/UI/HeroSelect/HeroSelectUI': {
    mask: 'Canvas/UI/HeroSelect/Mask',
    optionA: 'Canvas/UI/HeroSelect/OptionA',
    optionB: 'Canvas/UI/HeroSelect/OptionB',
  },
  'Canvas/UI/Guide/TutorialGuide': {
    tipLabel: 'Canvas/UI/Guide/TipLabel',
    pointerRoot: 'Canvas/UI/Guide/Pointer',
  },

  // 刷怪
  'GameRoot/World/EnemySpawner/EnemySpawner': {
    defaultTarget: 'GameRoot/World/Wall',
    enemyPrefab: 'db://assets/resources/prefabs/pref_enemy',
    spawnPoints: '（数组）GameRoot/World/EnemySpawner/SpawnPoints 下子节点',
  },

  // 场景地块
  'GameRoot/Systems/SceneTiles/SceneTileSystem': {
    eastArea: 'GameRoot/World/ExpandEast',
    westArea: 'GameRoot/World/ExpandWest',
    trees: '（数组）两侧 Trees 下全部 TreeEntity',
  },
};

/** 完整节点树（MCP 装载目标） */
export const SceneNodeTree = `
Main (Scene)
├── Canvas                          [Canvas, UITransform, Widget]
│   ├── Camera                      [Camera]
│   └── UI
│       ├── Hud                     [HudResourceUI, UITransform]
│       │   ├── MeatBg              [Sprite]          ← 背景条
│       │   ├── MeatIcon            [Sprite]
│       │   ├── MeatLabel           [Label]
│       │   ├── CoinBg              [Sprite]
│       │   ├── CoinIcon            [Sprite]
│       │   └── CoinLabel           [Label]
│       ├── Joystick                [VirtualJoystick, UITransform]  ← 全屏触区
│       │   ├── Hint                ← 固定右下角提示摇杆
│       │   │   └── HintStickRoot
│       │   │       ├── Bg          [Sprite]
│       │   │       ├── Thumb       [Sprite]          ← 倒8 动画驱动
│       │   │       ├── FingerIcon  [Sprite]
│       │   │       └── FingerAnim  [Animation]
│       │   └── StickRoot           ← 常规摇杆（触屏落点，初始隐藏）
│       │       ├── Bg              [Sprite]
│       │       └── Thumb           [Sprite]
│       ├── HeroSelect              [HeroSelectUI, UITransform, active=false]
│       │   ├── Mask                [Sprite, UIOpacity=102]
│       │   ├── OptionA             [Sprite + Button]
│       │   └── OptionB             [Sprite + Button]
│       └── Guide                   [TutorialGuide, UITransform]
│           ├── TipLabel            [Label]
│           └── Pointer             [Sprite, 可选]
│
└── GameRoot                        [GameManager]
    ├── Systems
    │   ├── Combat                  [DefenseCombatSystem]
    │   ├── Economy                 [ResourceEconomySystem]
    │   ├── NpcAi                   [NpcAiSystem]
    │   ├── Shop                    [ShopSystem]
    │   └── SceneTiles              [SceneTileSystem]
    │
    ├── Player                      [PlayerController, PlayerCarryStack, RigidBody2D, BoxCollider2D]
    │   ├── Visual                  [Sprite/Animation, SortingOrder2D]  ← 渲染在子节点
    │   └── CarryRoot               ← 背负资源堆叠起点
    │
    └── World
        ├── Drops                   ← 地面掉落资源父节点
        ├── Npcs                    ← 帮手/伐木工实例父节点
        ├── EnemySpawner            [EnemySpawner]
        │   └── SpawnPoints
        │       ├── Spawn_N         ← 屏幕外刷新点 ×N
        │       └── ...
        ├── Wall                    [Wall, BoxCollider2D]
        │   ├── Visual              [Sprite, SortingOrder2D]
        │   ├── HpBg                [Sprite]
        │   └── HpFill              [Sprite]          ← 水平绿条
        ├── Gate                    [Gate, Animation]
        │   └── Visual              [Sprite/Animation]
        │
        ├── City                    ← 初始城内区域
        │   ├── Stalls
        │   │   ├── Stall_RawMeat   [Stall]  stallId=stall_raw
        │   │   │   ├── InteractZone   ← 玩家/帮手交互区
        │   │   │   ├── PlaceRoot      ← 生肉堆叠点
        │   │   │   └── CustomerQueue
        │   │   └── Stall_CookedMeat [Stall, active=false]  stallId=stall_cooked
        │   │       ├── InteractZone   ← 玩家/帮手站立上交区（摆摊位前方地面）
        │   │       ├── CookPoint      ←【烤炉位·左】生肉飞到此点停留 cookDuration 秒
        │   │       ├── CookedPlace    ←【出炉落点·右】烤完飞到此，再计入库存
        │   │       ├── PlaceRoot      ←【货架堆叠】卖给顾客的成品肉叠这里（常与 CookedPlace 同位）
        │   │       └── CustomerQueue  ← demandType=CookedMeat；气泡图标用烤肉图
        │   ├── Deposits
        │   │   ├── Deposit_RawMeat [DepositPoint]    ← 模板/全局生肉点
        │   │   ├── Deposit_Coin    [DepositPoint]
        │   │   └── ...
        │   ├── Towers
        │   │   └── Tower_South     [ArrowTower]
        │   │       ├── Visual
        │   │       ├── MountTrigger [TowerMountTrigger, BoxCollider2D]
        │   │       ├── StandPoint          ← 英雄站立（ArrowTower.heroStandPoint）
        │   │       ├── BuildTrigger [PurchaseTrigger] ← 箭塔 30 金
        │   │       └── HeroPurchase [PurchaseTrigger] ← 英雄 60 金；买完后隐藏，仅用其位置
        │   │                                         ← 在此坐标启用/克隆 Deposit_RawMeat（meatDepositPoint）
        │   ├── Purchases
        │   │   ├── BuyHelper         [PurchaseTrigger]  ← 帮手 60 金
        │   │   └── BuyCookedStall    [PurchaseTrigger]  ← 烤肉摊 120 金；任意英雄后解锁
        │   └── CookedStallSite       [CookedStallSite]  ← 可挂 Purchases 或 City 上
        │       · purchaseTrigger → BuyCookedStall
        │       · stallRoot → Stall_CookedMeat
        │       · replaceWalls → 占摊位位置的 Wall 节点数组（购买后隐藏）
        │
        │   【推荐拖入预制体】db://assets/resources/prefabs/pref_CookedStallKit.prefab
        │   一次性含：CookedStallSite + BuyCookedStall + Stall_CookedMeat（含 Cook/Place/Queue）
        │   用户在 Main 中：拖到 City → 摆位置 → Buy 下再拖 pref_HelperPurchase_ui →
        │   CookedStallSite.replaceWalls 拖入占位墙 → Stall.coinDeposit 绑 Deposit_Coin →
        │   Economy.cookedMeatPrefab 可绑 pref_meat（或 pref_cooked_meat）
        │
        ├── ExpandEast              [active=false]    ← SceneTileSystem 开局强制关；买拓展后亮
        │   ├── EastExpandWalls
        │   ├── Trees / Tree_0..2   [TreeEntity, TreeChopTrigger]  ← 可空绑，SceneTileSystem 会自动收集
        │   ├── BuyLumberjack       [PurchaseTrigger, itemType=Lumberjack, expandSide=East]
        │   ├── Stall_Wood          ← 从 kit 挪入（解锁后显示+自带帮手）
        │   └── Tower_East          [ArrowTower, isExpandTower=true, towerId=tower_east]
        │       ├── Visual / MountTrigger / GroundPoint / StandPoint（建议补齐，与南塔同构）
        │       └── BuildTrigger    ← 从 kit 挪入（ExpandTower 200）
        │
        ├── ExpandWest              [对称；towerId=tower_west / stall_wood_west]
        │
        └── 【第五阶段 Prefab】db://assets/resources/prefabs/pref_ExpandSideKit.prefab
            含：ExpandSideSite + BuyExpand(180) + Stall_Wood + BuildTrigger
            另需：db://assets/resources/prefabs/pref_wood.prefab → Economy.woodPrefab / Carry.woodPrefab
`;

/** MCP 装载分阶段计划 */
export const McpLoadPhases = [
  {
    phase: 1,
    name: '骨架与六大系统',
    actions: [
      '打开 Main.scene',
      '创建 GameRoot / Systems / World / Player 骨架',
      '挂载 GameManager、六大 System、Player、EnemySpawner、Wall、Gate',
      '创建 Canvas/UI 下 Hud / Joystick / HeroSelect / Guide',
      '绑定 ReferenceBindingTable 中「已存在节点」的引用',
    ],
  },
  {
    phase: 2,
    name: '城内玩法节点',
    actions: [
      '创建 City/Stalls/Deposits/Towers/Purchases',
      '配置 Stall_RawMeat + CustomerQueue + Deposit 槽位',
      '配置 Tower_South + PurchaseTrigger（箭塔/英雄）',
      '创建 Player/Visual、CarryRoot',
      '创建 Drops、Npcs、SpawnPoints',
    ],
  },
  {
    phase: 3,
    name: '拓展区与树木',
    actions: [
      '创建 ExpandEast / ExpandWest（默认 inactive）',
      '每侧 3 棵树 + TreeChopTrigger',
      '拓展区 PurchaseTrigger、ExpandTower',
      'SceneTileSystem 绑定 eastArea/westArea/trees',
    ],
  },
  {
    phase: 4,
    name: '第四阶段·烤肉摊（只做 Prefab，不改 Main）',
    actions: [
      '使用 pref_CookedStallKit：含 BuyCookedStall + Stall_CookedMeat + CookedStallSite',
      '用户拖入 City，摆摊位/购买点位置',
      'BuyCookedStall 下拖入 pref_HelperPurchase_ui，绑 uiRoot/priceLabel',
      'CookedStallSite.replaceWalls 拖入占位围墙；Stall.coinDeposit → Deposit_Coin',
      '任意英雄后开放购买；付清 120 → 亮摊位 + 创建帮手 + 生肉烤制成烤肉交易',
    ],
  },
  {
    phase: 5,
    name: '第五阶段·东西拓展与木头链（只做 Prefab，不改 Main）',
    actions: [
      '场景已有 ExpandEast/West（墙/树/BuyLumberjack/空壳 Tower_*）；SceneTileSystem 已绑 east/west',
      '拖入两份 pref_ExpandSideKit：东 side=East / 西 side=West、woodStallId 对应',
      'BuyExpand 必须放在拓展区外（City 旁）；PurchaseUI 下拖 pref_HelperPurchase_ui 绑价格',
      'Stall_Wood 建议挪进对应 Expand*；BuildTrigger 挪到 Tower_* 下并绑 towerId',
      'ExpandSideSite.areaRoot → ExpandEast/West；可选绑 expandTower / buyLumberjack',
      'Economy.woodPrefab + PlayerCarry.woodPrefab → pref_wood；NpcAi.lumberjackPrefab 需有伐木工预制体',
      '流程：烤肉摊买完→亮 BuyExpand→付 180 解锁区域→木头摊+帮手 / 伐木工100 / 拓展塔200→建塔通关',
    ],
  },
] as const;
