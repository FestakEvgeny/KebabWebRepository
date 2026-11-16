/** Escapes LIKE wildcards so user input can be safely embedded in ILIKE patterns. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
