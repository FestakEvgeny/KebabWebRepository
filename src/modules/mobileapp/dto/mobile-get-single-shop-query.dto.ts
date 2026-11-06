import { IsUUID } from 'class-validator';

/**
 * GET /mobileapp/v1/shop/getSingle — the shop id travels in the query string,
 * since GET requests carry no body.
 */
export class MobileGetSingleShopQuery {
  @IsUUID()
  id!: string;
}
