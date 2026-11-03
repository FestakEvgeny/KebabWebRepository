import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { AppError } from '../utils/app-error';
import { ErrorDetail } from '../utils/error-detail';

type Constructor<T> = new () => T;

/**
 * Converts plain input (JSON body, query params or multipart form fields) into a
 * DTO instance and validates it. Unknown properties are stripped; violations are
 * reported as a 400 AppError with per-field details.
 */
export async function parseAndValidate<T extends object>(
  cls: Constructor<T>,
  data: unknown,
): Promise<T> {
  const instance = plainToInstance(cls, data);
  const errors = await validate(instance, { whitelist: true });
  if (errors.length > 0) {
    throw AppError.validation(collectDetails(errors));
  }
  return instance;
}

function collectDetails(errors: ValidationError[]): ErrorDetail[] {
  const details: ErrorDetail[] = [];
  for (const error of errors) {
    const messages = Object.values(error.constraints ?? {});
    if (messages.length > 0) details.push({ field: error.property, messages });
    if (error.children && error.children.length > 0) {
      details.push(...collectDetails(error.children));
    }
  }
  return details;
}
