import { Shop } from './shop.entity';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { ShopStats } from './shop-stats';
import { ShopRatingsReader, SHOP_RATINGS_READER } from './shop-rating-reader';
import { ShopModule, SHOP_ROUTER } from './shop.module';
import { toShopResponse } from './shop.mapper';

/** Entities owned by the shop module; assembled into the DataSource by the database layer. */
export const shopEntities = [Shop];

export {
  Shop,
  ShopService,
  ShopController,
  ShopModule,
  ShopStats,
  ShopRatingsReader,
  SHOP_RATINGS_READER,
  SHOP_ROUTER,
  toShopResponse,
};
export type { ShopRatingSummary } from './shop-rating-reader';
export { CreateShopRequest } from './dto/create-shop-request.dto';
export { UpdateShopRequest } from './dto/update-shop-request.dto';
