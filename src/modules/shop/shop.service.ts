import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Shop } from './shop.entity';
import { CreateShopRequest } from './dto/create-shop-request.dto';
import { UpdateShopRequest } from './dto/update-shop-request.dto';
import { PaginatedList } from '../../shared/utils/pagination/paginated-list';
import { PhotoPayload } from '../../shared/utils/photo/photo-payload';
import { ShopListFilters } from './shop-list-filters';
import { ShopListItem } from './shop-list-item';
import { ShopStats } from './shop-stats';
import { ShopRatingsReader, ShopRatingSummary, SHOP_RATINGS_READER } from './shop-rating-reader';
import { IShopRepository, SHOP_REPOSITORY } from './shop.repository';
import { UploadedPhoto } from '../../shared/utils/photo/uploaded-photo';
import { PhotoUpdate } from '../../shared/utils/photo/photo-update';
import { AppError } from '../../shared/utils/error/app-error';

@Injectable()
export class ShopService {
  constructor(
    // Tokens are declared explicitly (instead of relying on reflected
    // paramtypes) so the DI graph survives the esbuild-based dev runner.
    @Inject(SHOP_REPOSITORY) private readonly shopRepository: IShopRepository,
    // The reader is implemented by the rating module, whose service needs the
    // shop gateway in return; forwardRef keeps that mutual wiring resolvable.
    @Inject(forwardRef(() => SHOP_RATINGS_READER))
    private readonly ratingsReader: ShopRatingsReader,
  ) {}

  /** Existence check exposed to the rating module via its ShopGateway port. */
  async exists(id: string): Promise<boolean> {
    return this.shopRepository.exists(id);
  }

  async create(dto: CreateShopRequest, photo?: UploadedPhoto): Promise<Shop> {
    return this.shopRepository.add({
      name: dto.name.trim(),
      latitude: dto.latitude,
      longitude: dto.longitude,
      isValidated: false,
      ...(photo ? { photo: photo.buffer, photoMimeType: photo.mimeType } : {}),
    });
  }

  async listAll(): Promise<Shop[]> {
    return this.shopRepository.listValidated();
  }

  async getById(id: string): Promise<Shop> {
    const shop = await this.shopRepository.findById(id);
    if (!shop) throw AppError.notFound(`Shop with id "${id}" was not found.`);
    return shop;
  }

  async getByIdWithRatings(id: string): Promise<{ shop: Shop; ratings: ShopRatingSummary[] }> {
    const shop = await this.getById(id);
    const ratings = await this.ratingsReader.listValidatedByShop(id);
    return { shop, ratings };
  }

  async list(filters: ShopListFilters): Promise<PaginatedList<ShopListItem>> {
    return this.shopRepository.listFiltered(filters);
  }

  async getPhoto(id: string): Promise<PhotoPayload | null> {
    return this.shopRepository.findPhotoById(id);
  }

  async update(id: string, dto: UpdateShopRequest, photoUpdate: PhotoUpdate = {}): Promise<Shop> {
    const shop = await this.getById(id);
    shop.name = dto.name.trim();
    shop.latitude = dto.latitude;
    shop.longitude = dto.longitude;
    shop.isValidated = dto.isValidated;
    applyPhotoUpdate(shop, photoUpdate);
    return this.shopRepository.save(shop);
  }

  async setValidated(id: string, isValidated: boolean): Promise<Shop> {
    const shop = await this.getById(id);
    shop.isValidated = isValidated;
    return this.shopRepository.save(shop);
  }

  async remove(id: string): Promise<void> {
    await this.shopRepository.remove(id);
  }

  /**
   * Stores the rating-derived aggregates on the shop row. The rating module
   * computes the values from its own data and calls this through its
   * ShopGateway port — the source of truth never leaves the rating module.
   */
  async applyRatingAggregates(
    shopId: string,
    rating: string | null,
    countOfRates: number,
  ): Promise<void> {
    await this.shopRepository.applyRatingAggregates(shopId, rating, countOfRates);
  }

  async stats(): Promise<ShopStats> {
    return this.shopRepository.stats();
  }
}

function applyPhotoUpdate(shop: Shop, photoUpdate: PhotoUpdate): void {
  if (photoUpdate.photo) {
    shop.photo = photoUpdate.photo.buffer;
    shop.photoMimeType = photoUpdate.photo.mimeType;
  } else if (photoUpdate.removePhoto) {
    shop.photo = null;
    shop.photoMimeType = null;
  }
}
