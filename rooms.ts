import crypto from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { Game, toFEN, other, type Color, type GameResult } from '@glacier-magma/shared';
import type { Store } from './store.js';
import type { AuthUser } from './auth.js';

const GRACE_MS = 90_000;
const TYPES = ['open', 'arranged', 'closed'] as const;
export type RoomType = (typeof TYPES)[number];
interface Seat { id: string; name: string; connected: boolean; socketId: string | null; timer: NodeJS.Timeout | null }
export interface Room {
  id: string; name: string; type: RoomType; ownerId: string; seats: Record<Color, Seat | null>; game: Game;
  status: 'waiting' | 'playing' | 'finished'; result: GameResult | null; drawOffer: Color | null; rematch: Record<Color, boolean>;
  gameNo: number; inviteToken: string; watchToken: string; spectators: Set<string>; created: number; updated: number;
}
interface SockData { user: AuthUser; roomId: string | null }
type Sock = Socket & { data: SockData };
type Ack = ((res: unknown) => void) | undefined;
interface JoinReq { roomId?: unknown; token?: unknown }
const rid = (): string => crypto.randomBytes(4).toString('hex');
const tok = (p: string): string => p + '_' + crypto.randomBytes(12).toString('base64url');
const safeEq = (a: unknown, b: unknown): boolean => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (m: string): never => { throw new Error(m); };

/**
 * Room types
 *  open     - listed in lobby; anyone can take the 2nd seat; anyone can watch.
 *  arranged - listed in lobby (watchable by all); only holders of the invite link can take the 2nd seat.
 *  closed   - NOT listed; invite link = play, watch link = view only. No link, no entry.
 */
export class RoomManager {
  rooms = new Map<string, Room>(); lobbyTimer: NodeJS.Timeout | null = null;
  constructor(public io: Server, public store: Store) {
    setInterval(() => this.reap(), 60_000).unref();
  }

  // ---------- helpers ----------
  room(socket: Sock): Room { return this.rooms.get(socket.data.roomId) || fail('You are not in a room'); }
  colorOf(room: Room, userId: string): Color | null { return room.seats.w?.id === userId ? 'w' : room.seats.b?.id === userId ? 'b' : null; }
  pub(seat: Seat | null) { return seat ? { id: seat.id, name: seat.name, connected: seat.connected } : null; }
  snapshot(room: Room) {
    return {
      id: room.id, name: room.name, type: room.type, status: room.status, gameNo: room.gameNo, ownerId: room.ownerId,
      fen: toFEN(room.game.state), turn: room.game.turn, history: room.game.history, result: room.result, check: room.game.check,
      players: { w: this.pub(room.seats.w), b: this.pub(room.seats.b) }, drawOffer: room.drawOffer,
      rematch: room.rematch, spectators: room.spectators.size,
    };
  }
  broadcast(room: Room): void { room.updated = Date.now(); this.io.to('room:' + room.id).emit('room:state', this.snapshot(room)); this.lobbyDirty(); }
  lobby() {
    return [...this.rooms.values()].filter((r) => r.type !== 'closed').sort((a, b) => b.created - a.created).slice(0, 100).map((r) => ({
      id: r.id, name: r.name, type: r.type, status: r.status, spectators: r.spectators.size, moves: r.game.history.length,
      players: { w: r.seats.w?.name || null, b: r.seats.b?.name || null }, joinable: r.type === 'open' && r.status === 'waiting',
    }));
  }
  lobbyDirty() {
    if (this.lobbyTimer) return;
    this.lobbyTimer = setTimeout(() => { this.lobbyTimer = null; this.io.to('lobby').emit('lobby:list', this.lobby()); }, 200);
  }
  links(room: Room, userId: string) { return userId === room.ownerId ? { invite: room.inviteToken, watch: room.watchToken } : undefined; }

  // ---------- lifecycle ----------
  create(user: AuthUser, data: { type?: unknown; name?: unknown; color?: unknown } = {}): Room {
    const type = (TYPES as readonly unknown[]).includes(data.type) ? (data.type as RoomType) : fail('Invalid room type');
    if (this.rooms.size >= 1000) fail('Server is full, try again later');
    if ([...this.rooms.values()].filter((r) => r.ownerId === user.id).length >= 3) fail('You already own 3 rooms');
    const name = String(data.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || `${user.name}'s room`;
    const color: Color = data.color === 'w' || data.color === 'b' ? data.color : Math.random() < 0.5 ? 'w' : 'b';
    const room: Room = {
      id: rid(), name, type, ownerId: user.id, seats: { w: null, b: null }, game: new Game(), status: 'waiting', result: null,
      drawOffer: null, rematch: { w: false, b: false }, gameNo: 1, inviteToken: tok('p'), watchToken: tok('w'),
      spectators: new Set(), created: Date.now(), updated: Date.now(),
    };
    room.seats[color] = { id: user.id, name: user.name, connected: false, socketId: null, timer: null };
    this.rooms.set(room.id, room);
    this.lobbyDirty();
    return room;
  }

  join(socket: Sock, { roomId, token }: JoinReq = {}) {
    const room = this.rooms.get(String(roomId)) || fail('Room not found');
    const user = socket.data.user;
    if (socket.data.roomId && socket.data.roomId !== room.id) this.leave(socket);
    const hasInvite = safeEq(token, room.inviteToken), hasWatch = safeEq(token, room.watchToken);
    let color = this.colorOf(room, user.id), role: 'player' | 'spectator';
    if (color) role = 'player';
    else {
      const free = !room.seats.w ? 'w' : !room.seats.b ? 'b' : null;
      if (free && room.status === 'waiting' && (room.type === 'open' || hasInvite)) {
        color = free; role = 'player';
        room.seats[free] = { id: user.id, name: user.name, connected: false, socketId: null, timer: null };
      } else {
        if (room.type === 'closed' && !hasInvite && !hasWatch) fail('This is a closed room - you need a valid link');
        role = 'spectator';
      }
    }
    socket.join('room:' + room.id);
    socket.data.roomId = room.id;
    if (role === 'player') {
      const seat = room.seats[color!]!;
      if (seat.timer) clearTimeout(seat.timer); seat.timer = null; seat.connected = true; seat.socketId = socket.id;
      if (room.seats.w && room.seats.b && room.status === 'waiting') room.status = 'playing';
    } else room.spectators.add(socket.id);
    this.broadcast(room);
    return { role, color, state: this.snapshot(room), links: this.links(room, user.id) };
  }

  leave(socket: Sock, explicit = false): void {
    const room = this.rooms.get(socket.data.roomId);
    socket.data.roomId = null;
    if (!room) return;
    socket.leave('room:' + room.id);
    room.spectators.delete(socket.id);
    const color = this.colorOf(room, socket.data.user.id);
    const seat = color && room.seats[color];
    if (seat && seat.socketId === socket.id) {
      seat.connected = false; seat.socketId = null;
      if (explicit && room.status === 'waiting' && !room.seats[other(color)]) return this.close(room, 'The host left the room');
      if (room.status === 'playing') {
        if (seat.timer) clearTimeout(seat.timer);
        seat.timer = setTimeout(() => this.abandon(room, color), GRACE_MS);
        seat.timer.unref();
      }
    }
    this.broadcast(room);
  }

  abandon(room: Room, color: Color): void {
    if (room.status !== 'playing' || room.seats[color]?.connected) return;
    const opp = room.seats[other(color)];
    this.finish(room, { winner: opp?.connected ? other(color) : null, reason: 'abandoned' });
    this.broadcast(room);
  }

  close(room: Room, reason: string): void {
    for (const c of ['w', 'b'] as Color[]) { const t = room.seats[c]?.timer; if (t) clearTimeout(t); }
    this.io.to('room:' + room.id).emit('room:closed', { reason });
    this.io.in('room:' + room.id).socketsLeave('room:' + room.id);
    this.rooms.delete(room.id);
    this.lobbyDirty();
  }

  finish(room: Room, result: GameResult): void {
    if (room.status === 'finished') return;
    room.status = 'finished'; room.result = result; room.drawOffer = null; room.rematch = { w: false, b: false };
    for (const c of ['w', 'b'] as Color[]) {
      const s = room.seats[c];
      if (s) this.store.record(s.id, !result.winner ? 'draw' : result.winner === c ? 'win' : 'loss');
    }
  }

  reap() {
    const now = Date.now();
    for (const r of this.rooms.values()) {
      const anyone = r.spectators.size > 0 || (['w', 'b'] as Color[]).some((c) => r.seats[c]?.connected);
      const idle = now - r.updated;
      if (!anyone && (idle > 15 * 60_000 || (r.status === 'finished' && idle > 5 * 60_000))) this.close(r, 'Room expired');
      else if (r.status === 'finished' && idle > 60 * 60_000) this.close(r, 'Room expired');
    }
  }

  // ---------- gameplay (players only; spectators are rejected here) ----------
  player(socket: Sock): { room: Room; color: Color } {
    const room = this.room(socket);
    const color = this.colorOf(room, socket.data.user.id);
    if (!color) return fail('Spectators can only watch');
    return { room, color };
  }
  move(socket: Sock, d: { from?: unknown; to?: unknown; promo?: unknown } = {}) {
    const { room, color } = this.player(socket);
    if (room.status !== 'playing') fail('The game is not in progress');
    if (room.game.turn !== color) fail('Not your turn');
    const { from, to, promo } = d;
    if (typeof from !== 'number' || typeof to !== 'number' || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) return fail('Bad move');
    const entry = room.game.play({ from, to, promo: typeof promo === 'string' ? promo : undefined }) || fail('Illegal move');
    room.drawOffer = null;
    if (room.game.result) this.finish(room, room.game.result);
    this.broadcast(room);
    return entry;
  }
  resign(socket: Sock): void {
    const { room, color } = this.player(socket);
    if (room.status !== 'playing') fail('The game is not in progress');
    this.finish(room, { winner: other(color), reason: 'resign' }); this.broadcast(room);
  }
  offerDraw(socket: Sock): void {
    const { room, color } = this.player(socket);
    if (room.status !== 'playing') fail('The game is not in progress');
    if (room.drawOffer === other(color)) { this.finish(room, { winner: null, reason: 'agreement' }); }
    else room.drawOffer = color;
    this.broadcast(room);
  }
  respondDraw(socket: Sock, accept: boolean): void {
    const { room, color } = this.player(socket);
    if (room.status !== 'playing' || room.drawOffer !== other(color)) fail('No draw offer to answer');
    if (accept) this.finish(room, { winner: null, reason: 'agreement' }); else room.drawOffer = null;
    this.broadcast(room);
  }
  rematch(socket: Sock): void {
    const { room, color } = this.player(socket);
    if (room.status !== 'finished') fail('The game is not finished');
    room.rematch[color] = true;
    if (room.rematch.w && room.rematch.b) {
      [room.seats.w, room.seats.b] = [room.seats.b, room.seats.w];
      room.game = new Game(); room.status = 'playing'; room.result = null; room.drawOffer = null; room.rematch = { w: false, b: false }; room.gameNo++;
    }
    this.broadcast(room);
  }

  // ---------- socket wiring ----------
  attach(socket: Sock): void {
    const reply = (ack: Ack, fn: () => object | void) => {
      let res: unknown;
      try { res = { ok: true, ...(fn() || {}) }; } catch (e) { res = { ok: false, error: (e as Error).message }; }
      if (typeof ack === 'function') ack(res);
    };
    const user = socket.data.user;
    socket.on('lobby:subscribe', (_d: unknown, ack: Ack) => { socket.join('lobby'); reply(ack, () => ({ rooms: this.lobby() })); });
    socket.on('lobby:unsubscribe', () => socket.leave('lobby'));
    socket.on('room:create', (d: any, ack: Ack) => reply(ack, () => {
      const room = this.create(user, d && typeof d === 'object' ? d : {});
      return { roomId: room.id };
    }));
    socket.on('room:join', (d: any, ack: Ack) => reply(ack, () => this.join(socket, d && typeof d === 'object' ? d : {})));
    socket.on('room:leave', (_d: unknown, ack: Ack) => reply(ack, () => { this.leave(socket, true); }));
    socket.on('game:move', (d: any, ack: Ack) => reply(ack, () => { this.move(socket, d || {}); }));
    socket.on('game:resign', (_d: unknown, ack: Ack) => reply(ack, () => this.resign(socket)));
    socket.on('game:offerDraw', (_d: unknown, ack: Ack) => reply(ack, () => this.offerDraw(socket)));
    socket.on('game:respondDraw', (d: any, ack: Ack) => reply(ack, () => this.respondDraw(socket, !!d?.accept)));
    socket.on('game:rematch', (_d: unknown, ack: Ack) => reply(ack, () => this.rematch(socket)));
    socket.on('disconnect', () => this.leave(socket));
  }
}
