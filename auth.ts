import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import type { Store } from './store.js';

export interface AuthUser { id: string; name: string; guest: boolean }

const SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') { console.error('FATAL: set JWT_SECRET in production'); process.exit(1); }
  console.warn('[auth] JWT_SECRET not set - using a random dev secret (sessions reset on restart)');
  return crypto.randomBytes(32).toString('hex');
})();

export const signToken = (u: { id: string; name: string; guest?: boolean }): string => jwt.sign({ id: u.id, name: u.name, guest: !!u.guest }, SECRET, { expiresIn: '30d' });
export const verifyToken = (t: unknown): AuthUser => {
  const p = jwt.verify(String(t), SECRET) as jwt.JwtPayload;
  return { id: p.id as string, name: p.name as string, guest: !!p.guest };
};

const cleanName = (s: unknown): string => String(s || '').replace(/[^A-Za-z0-9_ \-]/g, '').trim().slice(0, 20);

export function authRouter(store: Store): express.Router {
  const r = express.Router();
  r.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));
  const out = (u: { id: string; name: string; guest?: boolean }) => ({ token: signToken(u), user: { id: u.id, name: u.name, guest: !!u.guest } });

  r.post('/register', (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username || '')) throw new Error('Username: 3-20 letters, numbers or underscore');
      if (typeof password !== 'string' || password.length < 6 || password.length > 72) throw new Error('Password must be 6-72 characters');
      res.json(out(store.register(username, password)));
    } catch (e) { res.status(400).json({ error: (e as Error).message }); }
  });
  r.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const u = typeof username === 'string' && typeof password === 'string' ? store.verify(username, password) : null;
    if (!u) return res.status(401).json({ error: 'Wrong username or password' });
    res.json(out(u));
  });
  r.post('/guest', (req, res) => {
    const name = cleanName(req.body?.name) || 'Guest';
    res.json(out({ id: 'g_' + crypto.randomBytes(6).toString('hex'), name: `${name}`, guest: true }));
  });
  r.get('/leaderboard', (_req, res) => res.json(store.leaderboard()));
  return r;
}
