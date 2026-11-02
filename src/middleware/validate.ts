import { plainToInstance, TransformFnParams } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { AppError, ErrorDetail } from '../utils/http-error';

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

/** Accepts `true`/`false` from query strings, checkboxes ("on") and JSON. */
export function booleanTransform({ value }: TransformFnParams): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'on') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'off') {
    return false;
  }
  return value; // let @IsBoolean() reject anything unexpected
}
