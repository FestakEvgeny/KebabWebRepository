export interface RatingResponse {
  id: string;
  shopId: string;
  shopName?: string;
  foodQualityRating: number;
  priceFairRating: number;
  interiorRating: number;
  overallRating: number;
  notes: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  isValidated: boolean;
  createdAt: string;
  updatedAt: string;
}
