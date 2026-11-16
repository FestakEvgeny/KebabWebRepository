import { forwardRef, Module } from '@nestjs/common';
import { Router } from 'express';
import { SHOP_RATINGS_READER, ShopModule, ShopRatingsReader } from '../shop';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';

/** DI token for the router mounted at /shops/:shopId/ratings by the composition root. */
export const RATINGS_NESTED_ROUTER = 'RATINGS_NESTED_ROUTER';
/** DI token for the router mounted at /ratings by the composition root. */
export const RATINGS_ROOT_ROUTER = 'RATINGS_ROOT_ROUTER';

/**
 * Nest wiring for the rating module. Besides its own service and HTTP layer,
 * it publishes the shop module's ratings-reader port (implemented over
 * RatingService) so the shop module can consume it through the container.
 */
@Module({
  imports: [forwardRef(() => ShopModule)],
  providers: [
    RatingService,
    RatingController,
    {
      provide: SHOP_RATINGS_READER,
      useFactory: (service: RatingService): ShopRatingsReader => ({
        listValidatedByShop: (shopId) => service.listValidatedSummaries(shopId),
      }),
      inject: [RatingService],
    },
    {
      provide: RATINGS_NESTED_ROUTER,
      useFactory: (controller: RatingController): Router => controller.nestedRouter,
      inject: [RatingController],
    },
    {
      provide: RATINGS_ROOT_ROUTER,
      useFactory: (controller: RatingController): Router => controller.rootRouter,
      inject: [RatingController],
    },
  ],
  exports: [
    RatingService,
    SHOP_RATINGS_READER,
    RATINGS_NESTED_ROUTER,
    RATINGS_ROOT_ROUTER,
  ],
})
export class RatingModule {}
