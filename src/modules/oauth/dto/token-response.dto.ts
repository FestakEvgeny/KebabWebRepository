export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds, so clients can refresh proactively. */
  expiresIn: number;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  /** True when the pair was issued by a successful login (vs an anonymous pair). */
  isAuthorized: boolean;
}
