import { AppError } from '../error/app-error';

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** 404s malformed ids early so handlers and services can assume a valid uuid. */
export function requireUuid(value: string, resource: string): void {
  if (!isUuid(value)) {
    throw AppError.notFound(`${resource} with id "${value}" was not found.`);
  }
}
