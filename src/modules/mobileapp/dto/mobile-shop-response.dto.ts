import { ShopResponse } from '../../shop/dto/shop-response.dto';

/** Shop payload for the mobile app: the moderation flag is never exposed. */
export type MobileShopResponse = Omit<ShopResponse, 'isValidated'>;
