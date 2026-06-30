import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export const AUTH_RATE_LIMIT_ERROR =
  "Too many authentication attempts. Try again later.";

type AuthRateLimiterOptions = Readonly<{
  limit: number;
  skipSuccessfulRequests?: boolean;
}>;

export function createAuthRateLimiter({
  limit,
  skipSuccessfulRequests = false,
}: AuthRateLimiterOptions): RequestHandler {
  return rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    limit,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: AUTH_RATE_LIMIT_ERROR,
    },
  });
}

export const registerRateLimiter = createAuthRateLimiter({
  limit: 5,
});

export const loginRateLimiter = createAuthRateLimiter({
  limit: 10,
  skipSuccessfulRequests: true,
});
