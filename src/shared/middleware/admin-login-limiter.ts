import rateLimit from 'express-rate-limit';

/** Applies to the admin login form. */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later.' },
  },
});
