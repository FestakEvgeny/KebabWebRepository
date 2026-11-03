/** Only allows same-site relative paths, blocking open redirects. */
export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  return fallback;
}
