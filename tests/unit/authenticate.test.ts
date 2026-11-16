import { describe, expect, it, vi } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import { AuthToken } from '../../src/modules/oauth/auth-token.entity';
import { createAuthenticate } from '../../src/modules/oauth/oauth.authenticate';
import { extractBearerToken } from '../../src/shared/utils/string/extract-bearer-token';
import { OAuthService } from '../../src/modules/oauth/oauth.service';

function createOAuthService(record: AuthToken | null): OAuthService {
  return {
    findActiveByAccessToken: vi.fn(async () => record),
  } as unknown as OAuthService;
}

function createRequest(authorization?: string): Request {
  return { headers: authorization === undefined ? {} : { authorization } } as unknown as Request;
}

/** asyncHandler settles the handler through microtasks; flush them before asserting. */
async function runMiddleware(
  handler: ReturnType<typeof createAuthenticate>,
  req: Request,
): Promise<{ next: ReturnType<typeof vi.fn> }> {
  const next = vi.fn();
  handler(req, {} as Response, next as NextFunction);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { next };
}

describe('createAuthenticate', () => {
  const record = { id: 'auth-1', accessToken: 'token-123' } as AuthToken;

  it('attaches the auth record and calls next() for a valid Bearer token', async () => {
    const req = createRequest('Bearer token-123');
    const { next } = await runMiddleware(createAuthenticate(createOAuthService(record)), req);

    expect(req.auth).toBe(record);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a missing Authorization header with 401 UNAUTHORIZED', async () => {
    const req = createRequest();
    const { next } = await runMiddleware(createAuthenticate(createOAuthService(record)), req);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }),
    );
  });

  it('rejects a non-Bearer scheme with 401 UNAUTHORIZED', async () => {
    const req = createRequest('Basic dXNlcjpwYXNz');
    const { next } = await runMiddleware(createAuthenticate(createOAuthService(record)), req);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }),
    );
  });

  it('rejects an unknown or expired access token with 401 INVALID_ACCESS_TOKEN', async () => {
    const req = createRequest('Bearer token-123');
    const { next } = await runMiddleware(createAuthenticate(createOAuthService(null)), req);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'INVALID_ACCESS_TOKEN' }),
    );
  });
});

describe('extractBearerToken', () => {
  it.each([
    ['Bearer token-123', 'token-123'],
    ['bearer token-123', 'token-123'],
    ['BEARER token-123', 'token-123'],
    ['Bearer    token-123', 'token-123'],
  ])('parses %j', (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });

  it.each([
    ['Basic abc'],
    ['Bearer'],
    ['Bearer '],
    ['Bearer token with spaces'],
    [undefined],
    [42],
  ])('rejects %j', (header) => {
    expect(extractBearerToken(header)).toBeNull();
  });
});
