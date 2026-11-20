import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '../src/types.ts';

const SECRET_KEY =
  process.env.SESSION_SECRET || 'sms-scholarledger-local-signing-secret-2026';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (!storedHash.includes(':')) {
    // Support pre-seeded sample/legacy passwords (e.g. hash_T01 or plain text) in existing Aiven DBs
    if (storedHash === password) return true;
    if (/^hash_T\d+$/i.test(storedHash) && password === 'teacher123') return true;
    if (/^hash_A\d+$/i.test(storedHash) && password === 'admin123') return true;
    return false;
  }
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface TokenPayload {
  user: AuthUser;
  exp: number;
}

export function createToken(user: AuthUser): string {
  const payload: TokenPayload = {
    user,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET_KEY).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(data)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    const decoded = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (!decoded || !decoded.user || decoded.exp < Date.now()) {
      return null;
    }
    return decoded.user;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

export function extractAuthUser(req: Request): AuthUser | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return verifyToken(token);
  }
  return null;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.authUser = user;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = extractAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  req.authUser = user;
  next();
}
