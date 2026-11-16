import 'reflect-metadata';
import { createDataSource } from './data-source';
import { env } from '../shared/config/env';
import { AdminAuthService } from '../modules/admin';
import { RatingService } from '../modules/rating';
import { ShopService } from '../modules/shop';

// A 1x1 pixel PNG used as a sample shop photo.
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

async function main(): Promise<void> {
  const dataSource = createDataSource({ migrationsRun: false });
  await dataSource.initialize();

  try {
    const adminAuth = new AdminAuthService(dataSource);
    const email = env.ADMIN_EMAIL.trim().toLowerCase();
    const created = await adminAuth.ensureAdminUser(email, env.ADMIN_PASSWORD);
    if (created) {
      console.log(`[kebab-guide] Admin user created: ${email} (password from ADMIN_PASSWORD)`);
    } else {
      console.log(`[kebab-guide] Admin user already exists: ${email}`);
    }

    if (env.SEED_SAMPLE_DATA) {
      await seedSampleData(dataSource);
    } else {
      console.log('[kebab-guide] SEED_SAMPLE_DATA is off - skipping sample data.');
    }
  } finally {
    await dataSource.destroy();
  }
}

async function seedSampleData(dataSource: Awaited<ReturnType<typeof createDataSource>>) {
  // The seed only creates shops and ratings, never reads detail pages, so the
  // ratings-reader port can stay empty.
  const shops = new ShopService(dataSource, { listValidatedByShop: async () => [] });
  const ratings = new RatingService(dataSource, shops);

  const existingShops = await shops.list({ page: 1, limit: 1, isValidated: undefined });
  if (existingShops.pagination.total > 0) {
    console.log('[kebab-guide] Shops already present - skipping sample data.');
    return;
  }

  const kebabKing = await shops.create(
    { name: 'Kebab King', latitude: 52.52, longitude: 13.405 },
    {
      buffer: Buffer.from(SAMPLE_PNG_BASE64, 'base64'),
      mimeType: 'image/png',
      size: 82,
    },
  );
  const donerDream = await shops.create({ name: 'Doner Dream', latitude: 52.535, longitude: 13.425 });
  const adanaGrill = await shops.create({ name: 'Adana Grill House', latitude: 52.51, longitude: 13.36 });
  await shops.setValidated(kebabKing.id, true);
  await shops.setValidated(donerDream.id, true);

  await ratings.createAsAdmin({
    shopId: kebabKing.id,
    foodQualityRating: 5,
    priceFairRating: 4,
    interiorRating: 4,
    notes: 'Generous portions and friendly staff.',
    isValidated: true,
  });
  await ratings.createAsAdmin({
    shopId: kebabKing.id,
    foodQualityRating: 4,
    priceFairRating: 5,
    interiorRating: 3,
    notes: null,
    isValidated: true,
  });
  await ratings.createAsAdmin({
    shopId: kebabKing.id,
    foodQualityRating: 2,
    priceFairRating: 2,
    interiorRating: 2,
    notes: 'Waiting for moderation.',
    isValidated: false,
  });
  await ratings.createAsAdmin({
    shopId: donerDream.id,
    foodQualityRating: 5,
    priceFairRating: 5,
    interiorRating: 4,
    notes: 'Best flatbread in town.',
    isValidated: true,
  });
  await ratings.createAsAdmin({
    shopId: adanaGrill.id,
    foodQualityRating: 4,
    priceFairRating: 3,
    interiorRating: 4,
    notes: null,
    isValidated: false,
  });

  console.log('[kebab-guide] Sample shops and ratings inserted.');
}

main().catch((error: unknown) => {
  console.error('[kebab-guide] Seed failed:', error);
  process.exit(1);
});
