import { Module } from '@nestjs/common';
import { Router } from 'express';
import { RatingModule, RatingService } from '../rating';
import { ShopModule, ShopService } from '../shop';
import { AdminAuthService } from './admin-auth.service';
import { createAdminRouter } from './admin.routes';

/** DI token under which the admin panel's mounted Express router is published. */
export const ADMIN_ROUTER = 'ADMIN_ROUTER';

/**
 * Nest wiring for the admin panel. It orchestrates the shop and rating
 * services for moderation views, so it imports both of their modules.
 */
@Module({
  imports: [ShopModule, RatingModule],
  providers: [
    AdminAuthService,
    {
      provide: ADMIN_ROUTER,
      useFactory: (
        adminAuth: AdminAuthService,
        shopService: ShopService,
        ratingService: RatingService,
      ): Router => createAdminRouter({ adminAuth, shopService, ratingService }),
      inject: [AdminAuthService, ShopService, RatingService],
    },
  ],
  exports: [AdminAuthService, ADMIN_ROUTER],
})
export class AdminModule {}
