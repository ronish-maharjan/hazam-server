import { randomInt } from 'node:crypto';

export function generateOtp(): string {
  const code = randomInt(100000, 999999);
  return code.toString();
}
