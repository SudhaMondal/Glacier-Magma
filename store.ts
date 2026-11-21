// Tiny JSON-file user store. Swap for Postgres/Redis when you need horizontal scale (see README).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface Stats { wins: number; losses: number; draws: number }
export interface UserRec { id: string; key: string; name: string; salt: string; hash: string; created: number; stats: Stats }

export class Store {
  dir: string; file: string; users = new Map<string, UserRec>(); saveTimer: NodeJS.Timeout | null = null;
  constructor(dir: string) {
    this.dir = dir;
    this.file = path.join(dir, 'users.json');
    fs.mkdirSync(dir, { recursive: true });
    try { for (const u of JSON.parse(fs.readFileSync(this.file, 'utf8')) as UserRec[]) this.users.set(u.key, u); } catch { /* first run */ }
  }
  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const tmp = this.file + '.tmp';
      fs.writeFile(tmp, JSON.stringify([...this.users.values()]), (e) => { if (!e) fs.rename(tmp, this.file, () => {}); });
    }, 300);
    this.saveTimer.unref();
  }
  hash(password: string, salt: string): string { return crypto.scryptSync(password, salt, 64).toString('hex'); }
  register(username: string, password: string): UserRec {
    const key = username.toLowerCase();
    if (this.users.has(key)) throw new Error('That username is taken');
    const salt = crypto.randomBytes(16).toString('hex');
    const user: UserRec = { id: 'u_' + crypto.randomBytes(6).toString('hex'), key, name: username, salt, hash: this.hash(password, salt), created: Date.now(), stats: { wins: 0, losses: 0, draws: 0 } };
    this.users.set(key, user);
    this.save();
    return user;
  }
  verify(username: string, password: string): UserRec | null {
    const u = this.users.get(username.toLowerCase());
    if (!u) return null;
    const a = Buffer.from(this.hash(password, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
    return crypto.timingSafeEqual(a, b) ? u : null;
  }
  byId(id: string): UserRec | null { for (const u of this.users.values()) if (u.id === id) return u; return null; }
  record(id: string, outcome: 'win' | 'loss' | 'draw'): void {
    const u = this.byId(id);
    if (!u) return;
    u.stats[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws']++;
    this.save();
  }
  leaderboard(n = 10) {
    return [...this.users.values()].map((u) => ({ name: u.name, ...u.stats })).sort((a, b) => b.wins - a.wins || a.losses - b.losses).slice(0, n);
  }
}
