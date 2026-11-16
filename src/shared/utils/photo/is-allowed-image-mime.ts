export function isAllowedImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
