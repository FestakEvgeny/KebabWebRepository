import { PaginatedList } from '../../shared/utils/pagination/paginated-list';
import { PhotoPayload } from '../../shared/utils/photo/photo-payload';
import { Shop } from './shop.entity';
import { ShopListFilters } from './shop-list-filters';
import { ShopListItem } from './shop-list-item';
import { ShopStats } from './shop-stats';

/** Data for a new shop row; a photo arrives as raw bytes with its mime type. */
export interface NewShop {
  name: string;
  latitude: number;
  longitude: number;
  isValidated?: boolean;
  photo?: Buffer;
  photoMimeType?: string;
}

/**
 * Port for the shop_table persistence layer. Implemented by ShopRepositoryImpl
 * over the TypeORM repository; consumers inject this interface via the
 * SHOP_REPOSITORY token, never the implementation.
 */
export interface IShopRepository {
  exists(id: string): Promise<boolean>;
  findById(id: string): Promise<Shop | null>;
  findPhotoById(id: string): Promise<PhotoPayload | null>;
  add(data: NewShop): Promise<Shop>;
  save(shop: Shop): Promise<Shop>;
  remove(id: string): Promise<void>;
  /** All validated shops, newest first, without photo blobs. */
  listValidated(): Promise<Shop[]>;
  /** Filtered, distance-aware listing with pagination metadata. */
  listFiltered(filters: ShopListFilters): Promise<PaginatedList<ShopListItem>>;
  /** Stores the rating-derived aggregates computed by the rating module. */
  applyRatingAggregates(shopId: string, rating: string | null, countOfRates: number): Promise<void>;
  stats(): Promise<ShopStats>;
}

/** DI token for the shop repository port. */
export const SHOP_REPOSITORY = 'SHOP_REPOSITORY';
