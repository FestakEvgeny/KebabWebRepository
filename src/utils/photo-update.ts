import { UploadedPhoto } from './uploaded-photo';

/** The photo part of an update: replace with a new upload and/or remove the current one. */
export interface PhotoUpdate {
  photo?: UploadedPhoto;
  removePhoto?: boolean;
}
