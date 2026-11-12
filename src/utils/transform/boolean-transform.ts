import { TransformFnParams } from 'class-transformer';

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
