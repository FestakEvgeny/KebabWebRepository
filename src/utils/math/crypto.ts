import { randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
