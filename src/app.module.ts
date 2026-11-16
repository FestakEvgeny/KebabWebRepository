import { DynamicModule, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './modules/admin';
import { OAuthModule } from './modules/oauth';
import { RatingModule } from './modules/rating';
import { ShopModule } from './modules/shop';

/**
 * Root of the DI graph — the Nest counterpart of app.ts, which stays
 * responsible for the HTTP layer (Express middleware and router mounting).
 * Feature modules wire their own providers; cross-module ports are satisfied
 * inside the shop/rating module pair via forwardRef (see their *.module.ts).
 */
@Module({})
export class AppModule {
  static forRoot(dataSource: DataSource): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.forRoot(dataSource),
        ShopModule,
        RatingModule,
        OAuthModule,
        AdminModule,
      ],
    };
  }
}
