import { ShopStats } from '../shop';
import { RatingStats } from '../rating';

/** Dashboard view-model stats, composed from the shop and rating public APIs. */
export interface DashboardStats extends ShopStats, RatingStats {}
