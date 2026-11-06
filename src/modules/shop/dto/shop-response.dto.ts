/**
 * Public shop payload (API v1). The moderation flag is internal: the public
 * API never exposes `isValidated` — only the admin panel sees it.
 */
export interface ShopResponse {
  id: string;
  name: string;
  geo: { latitude: number; longitude: number };
  rating: number | null;
  countOfRates: number | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  distanceKm?: number;
}
