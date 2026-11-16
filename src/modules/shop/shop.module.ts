import { forwardRef, Module } from '@nestjs/common';
import { Router } from 'express';
import { RatingModule } from '../rating';
import { ShopController } from './shop.controller';
import { ShopRepositoryImpl } from './shop.repository-impl';
import { SHOP_REPOSITORY } from './shop.repository';
import { ShopService } from './shop.service';
import { createShopRouter } from './shop.routes';

/** DI token under which the shop module's mounted Express router is published. */
export const SHOP_ROUTER = 'SHOP_ROUTER';

/**
 * Nest wiring for the shop module. The ratings-reader port is satisfied by
 * the rating module, so the two modules import each other; Nest's forwardRef
 * keeps that mutual wiring resolvable.
 */
@Module({
  imports: [forwardRef(() => RatingModule)],
  providers: [
    {
      provide: SHOP_REPOSITORY,
      useClass: ShopRepositoryImpl,
    },
    ShopService,
    ShopController,
    {
      provide: SHOP_ROUTER,
      useFactory: (controller: ShopController): Router => createShopRouter(controller),
      inject: [ShopController],
    },
  ],
  exports: [ShopService, SHOP_ROUTER],
})
export class ShopModule {}
