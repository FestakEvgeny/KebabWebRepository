export interface ListRatingsOptions {
  page?: unknown;
  limit?: unknown;
  /** Filter by moderation status; omit to return everything. */
  isValidated?: boolean;
}
