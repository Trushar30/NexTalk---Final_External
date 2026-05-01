import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { TokenPayload, AuthTokens } from '../types';

export function signAccessToken(userId: string): string {
  return jwt.sign({ userId, type: 'access' } as TokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' } as TokenPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: '30d',
  });
}

export function generateTokens(userId: string): AuthTokens {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId),
  };
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}
