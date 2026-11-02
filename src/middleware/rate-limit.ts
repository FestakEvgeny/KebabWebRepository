import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/** Applies to public write endpoints (create shop / submit rating). */
export const apiWriteLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
  },
});

/** Applies to the admin login form. */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later.' } },
});
