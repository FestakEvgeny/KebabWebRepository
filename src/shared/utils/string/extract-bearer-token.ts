/** Reads the token out of an `Authorization: Bearer <token>` header (the scheme is case-insensitive per RFC 6750). */
export function extractBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(header);
  return match ? match[1] : null;
}
