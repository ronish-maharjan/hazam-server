import { randomBytes } from 'node:crypto';

/**
 * Generates a unique coupon code in format: HAZ-XXXX-XXXX
 * Uses uppercase alphanumeric characters (no ambiguous chars like 0/O, 1/I/L)
 */
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomChars(length: number): string {
  const bytes = randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }

  return result;
}

export function generateCouponCode(): string {
  const part1 = randomChars(4);
  const part2 = randomChars(4);
  return `HAZ-${part1}-${part2}`;
}
