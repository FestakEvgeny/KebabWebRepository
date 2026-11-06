import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { parseAndValidate } from '../../middleware/validate';
import { RefreshTokenRequest } from './dto/refresh-token-request.dto';
import { toTokenResponse } from './oauth.mapper';
import { OAuthService } from './oauth.service';

/**
 * HTTP handlers for the token API served at /api/v1/oauth/token.
 * Routers own middleware and paths; this class owns request parsing and
 * response shapes only.
 */
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  /** GET /oauth/token */
  issue = asyncHandler(async (_req: Request, res: Response) => {
    const record = await this.oauth.issueTokens();
    res.status(201).json({ data: toTokenResponse(record) });
  });

  /** POST /oauth/token */
  refresh = asyncHandler(async (req: Request, res: Response) => {
    const dto = await parseAndValidate(RefreshTokenRequest, req.body);
    const record = await this.oauth.refreshAccessToken(dto.refreshToken);
    res.json({ data: toTokenResponse(record) });
  });
}
