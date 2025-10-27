import fetch, { Response } from 'node-fetch';
import jwt from 'jsonwebtoken';
import PrismaDatabase from '../database/prisma';
import config from '../config/environment';

export interface SessionContext {
  discordId: string;
  username?: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
}

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

const API_BASE = config.api.publicUrl?.replace(/\/$/, '') || '';
const tokenCache = new Map<string, TokenCacheEntry>();

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const ensureJwtSecret = (): string => {
  if (!config.security.jwtSecret) {
    throw new Error('JWT secret is not configured. Set JWT_SECRET in the environment.');
  }
  return config.security.jwtSecret;
};

const fetchUser = async (ctx: SessionContext) => {
  let user = await PrismaDatabase.getUser(ctx.discordId);
  if (!user) {
    user = await PrismaDatabase.createUser({
      discordId: ctx.discordId,
      discordUsername: ctx.username ?? ctx.displayName
    });
  } else if (!user.discord_username && (ctx.username || ctx.displayName)) {
    await PrismaDatabase.updateUser(ctx.discordId, {
      discordUsername: ctx.username ?? ctx.displayName
    });
    user = await PrismaDatabase.getUser(ctx.discordId);
  }
  return user;
};

const createSessionToken = async (ctx: SessionContext): Promise<string> => {
  const cached = tokenCache.get(ctx.discordId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const user = await fetchUser(ctx);
  if (!user) {
    throw new Error(`Unable to resolve user record for Discord ID ${ctx.discordId}`);
  }

  const payload = {
    userId: user.id,
    discordId: user.discord_id,
    email: user.email ?? ctx.email ?? '',
    name: user.name ?? ctx.displayName ?? ctx.username ?? ctx.discordId,
    image: user.image ?? ctx.avatarUrl ?? ''
  };

  const token = jwt.sign(payload, ensureJwtSecret(), { expiresIn: '15m' });
  tokenCache.set(ctx.discordId, {
    token,
    expiresAt: Date.now() + 14 * 60 * 1000
  });

  return token;
};

const parseResponse = async (res: Response) => {
  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const request = async <T>(
  ctx: SessionContext,
  path: string,
  init: { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }
): Promise<T> => {
  if (!API_BASE) {
    throw new Error('API public URL is not configured.');
  }

  const token = await createSessionToken(ctx);
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    Cookie: `session=${token}`
  };

  const response = await fetch(url, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : response.statusText) || 'Request failed';
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
};

export const apiGet = async <T>(ctx: SessionContext, path: string): Promise<T> => {
  return request<T>(ctx, path, { method: 'GET' });
};

export const apiPost = async <T>(ctx: SessionContext, path: string, body?: unknown): Promise<T> => {
  return request<T>(ctx, path, { method: 'POST', body });
};

