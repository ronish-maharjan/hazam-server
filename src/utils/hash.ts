import argon2 from 'argon2';
import { createHash } from 'node:crypto';

// ─── Password Hashing (Argon2) ───────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

// ─── Token Hashing (SHA-256) ─────────────────────────────
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
