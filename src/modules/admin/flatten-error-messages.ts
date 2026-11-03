import { ErrorDetail } from '../../utils/error/error-detail';

export function flattenErrorMessages(error: { details?: ErrorDetail[] }): string[] {
  if (error.details && error.details.length > 0) {
    return error.details.map((detail) => `${detail.field}: ${detail.messages.join(', ')}`);
  }
  return [error instanceof Error ? error.message : String(error)];
}
