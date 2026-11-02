import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { createDataSource } from './data-source';
import { env } from '../config/env';
import { AdminUser } from './entities/admin-user.entity';
import { Rating } from './entities/rating.entity';
import { Shop } from './entities/shop.entity';
import { ShopService } from '../modules/shop/shop.service';

// A 1x1 pixel PNG used as a sample shop photo.
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

async function main(): Promise<void> {
  const dataSource = createDataSource({ migrationsRun: false });
  await dataSource.initialize();

  try {
    const adminRepo = dataSource.getRepository(AdminUser);
    const email = env.ADMIN_EMAIL.trim().toLowerCase();
    const existing = await adminRepo.findOneBy({ email });
    if (existing) {
      console.log(`[kebab-guide] Admin user already exists: ${email}`);
    } else {
      await adminRepo.save(
        adminRepo.create({
          email,
          passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12),
        }),
      );
      console.log(`[kebab-guide] Admin user created: ${email} (password from ADMIN_PASSWORD)`);
    }

    const shopRepo = dataSource.getRepository(Shop);
    const shopCount = await shopRepo.count();
    if (env.SEED_SAMPLE_DATA && shopCount === 0) {
      await seedSampleData(dataSource);
      console.log('[kebab-guide] Sample shops and ratings inserted.');
    } else if (!env.SEED_SAMPLE_DATA) {
      console.log('[kebab-guide] SEED_SAMPLE_DATA is off - skipping sample data.');
    } else {
      console.log('[kebab-guide] Shops already present - skipping sample data.');
    }
  } finally {
    await dataSource.destroy();
  }
}

async function seedSampleData(dataSource: Awaited<ReturnType<typeof createDataSource>>) {
  const shopRepo = dataSource.getRepository(Shop);
  const shopService = new ShopService(dataSource);

  const [kebabKing, donerDream, adanaGrill] = await shopRepo.save([
    shopRepo.create({
      name: 'Kebab King',
      latitude: 52.52,
      longitude: 13.405,
      isValidated: true,
      photo: Buffer.from(SAMPLE_PNG_BASE64, 'base64'),
      photoMimeType: 'image/png',
    }),
    shopRepo.create({ name: 'Doner Dream', latitude: 52.535, longitude: 13.425, isValidated: true }),
    shopRepo.create({ name: 'Adana Grill House', latitude: 52.51, longitude: 13.36, isValidated: false }),
  ]);

  const ratingRepo = dataSource.getRepository(Rating);
  await ratingRepo.save([
    {
      shopId: kebabKing.id,
      foodQualityRating: 5,
      priceFairRating: 4,
      interiorRating: 4,
      notes: 'Generous portions and friendly staff.',
      isValidated: true,
    },
    {
      shopId: kebabKing.id,
      foodQualityRating: 4,
      priceFairRating: 5,
      interiorRating: 3,
      notes: null,
      isValidated: true,
    },
    {
      shopId: kebabKing.id,
      foodQualityRating: 2,
      priceFairRating: 2,
      interiorRating: 2,
      notes: 'Waiting for moderation.',
      isValidated: false,
    },
    {
      shopId: donerDream.id,
      foodQualityRating: 5,
      priceFairRating: 5,
      interiorRating: 4,
      notes: 'Best flatbread in town.',
      isValidated: true,
    },
    {
      shopId: adanaGrill.id,
      foodQualityRating: 4,
      priceFairRating: 3,
      interiorRating: 4,
      notes: null,
      isValidated: false,
    },
  ]);
  for (const shop of [kebabKing, donerDream]) {
    await shopService.recomputeAggregates(shop.id);
  }
}

main().catch((error: unknown) => {
  console.error('[kebab-guide] Seed failed:', error);
  process.exit(1);
});
