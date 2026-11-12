import { NextFunction, Request, RequestHandler, Response } from 'express';
import { OAuthService } from '../modules/oauth/oauth.service';
import { AppError } from '../utils/error/app-error';
import { extractBearerToken } from '../utils/string/extract-bearer-token';
import { asyncHandler } from './async-handler';

export function createAuthenticate(oauthService: OAuthService): RequestHandler {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        "Missing access token. Send the header 'Authorization: Bearer <accessToken>' (obtain one via GET /api/v1/oauth/token).",
      );
    }

    const record = await oauthService.findActiveByAccessToken(token);
    if (!record) {
      throw new AppError(
        401,
        'INVALID_ACCESS_TOKEN',
        'Access token is invalid or expired. Refresh it via POST /api/v1/oauth/token.',
      );
    }

    req.auth = record;
    next();
  });
}
