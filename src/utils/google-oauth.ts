import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

const oauthClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL,
);

// ─── State Token (CSRF protection) ──────────────────────

interface OAuthState {
  role: 'customer' | 'barber';
  nonce: string;
}

const STATE_EXPIRY = '10m';

export function generateOAuthState(role: 'customer' | 'barber'): string {
  const payload: OAuthState = {
    role,
    nonce: randomBytes(16).toString('hex'),
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: STATE_EXPIRY,
  });
}

export function verifyOAuthState(state: string): OAuthState {
  return jwt.verify(state, env.JWT_ACCESS_SECRET) as OAuthState;
}

// ─── Auth URL ────────────────────────────────────────────

export function getGoogleAuthUrl(state: string): string {
  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'consent',
  });

  return url;
}

// ─── Exchange Code → User Info ───────────────────────────

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  fullName: string;
}

export async function getGoogleUser(code: string): Promise<GoogleUserInfo> {
  const { tokens } = await oauthClient.getToken(code);
  oauthClient.setCredentials(tokens);

  const idToken = tokens.id_token;

  if (!idToken) {
    throw new Error('No ID token received from Google');
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Invalid Google ID token payload');
  }

  if (!payload.sub || !payload.email) {
    throw new Error('Missing required fields in Google profile');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    fullName: payload.name || payload.email.split('@')[0],
  };
}
