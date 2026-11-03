import { Rating } from "../../../database/entities/rating.entity";
import { ShopRatingMobileResponse } from "../dto/single/shop-rating-mobile-response.dto";

export function toRatingMobileResponse(rating: Rating): ShopRatingMobileResponse {
    return {
        id: rating.id,
        notes: rating.notes,
        priceFairRating: rating.priceFairRating,
        interiorRating: rating.interiorRating,
        foodQualityRating: rating.foodQualityRating,
    };
}