import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import config from '../config/environment';

// Session user interface
interface SessionUser {
  userId: string;
  discordId: string;
  email?: string;
  name?: string;
  image?: string;
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      sessionUser?: SessionUser;
    }
    interface Locals {
      sessionUser?: SessionUser;
    }
  }
}

function parseCookie(cookieHeader?: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!cookieHeader) return map;
  for (const pair of cookieHeader.split(';')) {
    const [k, v] = pair.split('=');
    if (!k) continue;
    map[k.trim()] = decodeURIComponent((v || '').trim());
  }
  return map;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const cookies = parseCookie(req.headers.cookie);
    let token = cookies['session'];

    if (!token && req.headers.authorization) {
      const [scheme, value] = req.headers.authorization.split(' ');
      if (scheme?.toLowerCase() === 'bearer') token = value;
    }

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = jwt.verify(token, config.security.jwtSecret) as JwtPayload & SessionUser;
    req.sessionUser = {
      userId: payload.userId,
      discordId: payload.discordId,
      email: payload.email,
      name: payload.name,
      image: payload.image
    };
    res.locals.sessionUser = req.sessionUser;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const cookies = parseCookie(req.headers.cookie);
    const token = cookies['session'];
    if (!token) return next();
    const payload = jwt.verify(token, config.security.jwtSecret) as JwtPayload & SessionUser;
    req.sessionUser = {
      userId: payload.userId,
      discordId: payload.discordId,
      email: payload.email,
      name: payload.name,
      image: payload.image
    };
  } catch {
    // ignore
  }
  return next();
}
