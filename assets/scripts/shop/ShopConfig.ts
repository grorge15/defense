import { ShopItemType, ExpandSide } from '../core/Enums';
import { GameConstants } from '../core/GameConstants';

export interface ShopItemConfig {
    itemType: ShopItemType;
    price: number;
    /** 需要已建造初始箭塔 */
    requireTowerBuilt?: boolean;
    /** 需要已购买帮手 */
    requireHelper?: boolean;
    /** 需要任意一名英雄 */
    requireAnyHero?: boolean;
    /** @deprecated 改用 requireAnyHero；保留兼容 */
    requireBothHeroes?: boolean;
    /** 需要烤肉摊 */
    requireCookedStall?: boolean;
    /** 扩展侧 */
    side?: ExpandSide;
    displayName: string;
}

/** 商店商品配置（硬编码） */
export const ShopCatalog: ShopItemConfig[] = [
    {
        itemType: ShopItemType.ArrowTower,
        price: GameConstants.SHOP_PRICE[ShopItemType.ArrowTower],
        displayName: '箭塔',
    },
    {
        itemType: ShopItemType.MeatHelper,
        price: GameConstants.SHOP_PRICE[ShopItemType.MeatHelper],
        requireTowerBuilt: true,
        displayName: '生肉帮手',
    },
    {
        itemType: ShopItemType.Hero,
        price: GameConstants.SHOP_PRICE[ShopItemType.Hero],
        requireHelper: true,
        displayName: '英雄',
    },
    {
        itemType: ShopItemType.CookedMeatStall,
        price: GameConstants.SHOP_PRICE[ShopItemType.CookedMeatStall],
        requireAnyHero: true,
        displayName: '烤肉摊位',
    },
    {
        itemType: ShopItemType.ExpandArea,
        price: GameConstants.SHOP_PRICE[ShopItemType.ExpandArea],
        requireCookedStall: true,
        side: ExpandSide.East,
        displayName: '东侧拓展',
    },
    {
        itemType: ShopItemType.ExpandArea,
        price: GameConstants.SHOP_PRICE[ShopItemType.ExpandArea],
        requireCookedStall: true,
        side: ExpandSide.West,
        displayName: '西侧拓展',
    },
    {
        itemType: ShopItemType.Lumberjack,
        price: GameConstants.SHOP_PRICE[ShopItemType.Lumberjack],
        displayName: '伐木工',
    },
    {
        itemType: ShopItemType.ExpandTower,
        price: GameConstants.SHOP_PRICE[ShopItemType.ExpandTower],
        displayName: '拓展箭塔',
    },
];
