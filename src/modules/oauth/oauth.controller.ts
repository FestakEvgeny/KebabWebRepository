import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { extractBearerToken } from '../../utils/string/extract-bearer-token';
import { parseAndValidate } from '../../middleware/validate';
import { AppError } from '../../utils/error/app-error';
import { LoginRequest } from './dto/login-request.dto';
import { RegisterRequest } from './dto/register-request.dto';
import { RefreshTokenRequest } from './dto/refresh-token-request.dto';
import { toRegisteredUserResponse, toTokenResponse } from './oauth.mapper';
import { OAuthService } from './oauth.service';

/**
 * HTTP handlers for the OAuth API served at /api/v1/oauth:
 * token issuing/refreshing plus register/login/logout. Routers own middleware
 * and paths; this class owns request parsing and response shapes only.
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

  /** POST /oauth/register — stores the user, returns no tokens. */
  register = asyncHandler(async (req: Request, res: Response) => {
    const dto = await parseAndValidate(RegisterRequest, req.body);
    const user = await this.oauth.register(dto.email, dto.password);
    res.status(201).json({ data: toRegisteredUserResponse(user) });
  });

  /** POST /oauth/login — accepts application/x-www-form-urlencoded (email + password). */
  login = asyncHandler(async (req: Request, res: Response) => {
    const dto = await parseAndValidate(LoginRequest, req.body);
    const record = await this.oauth.login(dto.email, dto.password);
    res.status(201).json({ data: toTokenResponse(record) });
  });

  /** POST /oauth/logout — deletes the auth_table record behind the Bearer access token. */
  logout = asyncHandler(async (req: Request, res: Response) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        "Missing access token. Send the header 'Authorization: Bearer <accessToken>'.",
      );
    }
    const removed = await this.oauth.logout(token);
    if (!removed) {
      throw new AppError(
        401,
        'INVALID_ACCESS_TOKEN',
        'Access token is unknown; the session is already gone.',
      );
    }
    res.status(204).end();
  });
}
