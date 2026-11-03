export interface UploadedPhoto {
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export function toUploadedPhoto(file?: Express.Multer.File): UploadedPhoto | undefined {
  if (!file) return undefined;
  return { buffer: file.buffer, mimeType: file.mimetype, size: file.size };
}
