import { TransformFnParams } from 'class-transformer';

/** Trims and lowercases an email so lookups and the unique constraint are case-insensitive. */
export function emailTransform({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
