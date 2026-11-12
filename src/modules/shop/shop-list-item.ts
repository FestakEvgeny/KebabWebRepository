import { Shop } from '../../database/entities/shop.entity';

/** Shop list item; `distanceKm` is attached when a geo filter was applied. */
export type ShopListItem = Shop & { distanceKm?: number };
