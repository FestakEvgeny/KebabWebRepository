/** Photo bytes plus their mime type, as loaded from persistence. */
export interface PhotoPayload {
  buffer: Buffer;
  mimeType: string;
}
