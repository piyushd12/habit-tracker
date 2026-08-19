import crypto from 'crypto';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateRefreshTokenValue(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getRefreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}
