export interface ShopResponse {
  id: string;
  name: string;
  geo: { latitude: number; longitude: number };
  rating: number | null;
  countOfRates: number | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  isValidated: boolean;
  createdAt: string;
  updatedAt: string;
  distanceKm?: number;
}
