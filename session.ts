// A "session" hides where the game lives. Online = server-authoritative room. Local = AI or pass-and-play.
import { Game, other, type Color, type Difficulty } from '@glacier-magma/shared';
import type { AuthState, GameMove, Links, Session, Snapshot } from './types.js';
import { emit, getSocket, roomLink } from './net.js';

export class OnlineSession implements Session {
  h: any;
  links: any;
  me: any;
  mode: any;
  offline: any;
  onClosed: any;
  onUpdate: any;
  roomId: any;
  state: any;
  token: any;
  constructor(me: AuthState['user'], roomId: string, token: string | undefined, onUpdate: () => void, onClosed: (reason?: string) => void) {
    Object.assign(this, { me, roomId, token, onUpdate, onClosed, mode: 'online', state: null, links: null, offline: false });
    const s = getSocket()!;
    this.h = {
      'room:state': (st) => { if (st.id === this.roomId) { this.state = st; this.onUpdate(); } },
      'room:closed': (d) => this.onClosed(d.reason),
      disconnect: () => { this.offline = true; this.onUpdate(); },
      connect: () => { if (this.offline) { this.offline = false; this.join().catch((e) => this.onClosed(e.message)); } },
    };
    for (const [k, f] of Object.entries(this.h as Record<string, (...a: any[]) => void>)) s.on(k, f);
  }
  async join() {
    const r = await emit('room:join', { roomId: this.roomId, token: this.token });
    this.state = r.state;
    if (r.links) this.links = { invite: roomLink(this.roomId, r.links.invite), watch: roomLink(this.roomId, r.links.watch), open: roomLink(this.roomId) };
    this.onUpdate();
  }
  snapshot(): Snapshot {
    const st = this.state, id = this.me.id;
    const myColor = st.players.w?.id === id ? 'w' : st.players.b?.id === id ? 'b' : null;
    return { ...st, mode: 'online', gameKey: st.id + ':' + st.gameNo, myColor, offline: this.offline, thinking: false };
  }
  canControl(color: Color): boolean { const s = this.snapshot(); return s.status === 'playing' && s.myColor === color; }
  move(m: GameMove) { return emit('game:move', m); }
  resign() { return emit('game:resign'); }
  offerDraw() { return emit('game:offerDraw'); }
  respondDraw(accept: boolean) { return emit('game:respondDraw', { accept }); }
  rematch() { return emit('game:rematch'); }
  async leave(): Promise<void> {
    const s = getSocket();
    for (const [k, f] of Object.entries(this.h as Record<string, (...a: any[]) => void>)) s?.off(k, f);
    try { await emit('room:leave'); } catch { /* ignore */ }
  }
}

export class LocalSession implements Session {
  difficulty: any;
  game: any;
  gameNo: any;
  human: any;
  links: any;
  mode: any;
  name: any;
  onUpdate: any;
  t0: any;
  thinking: any;
  worker: any;
  /** mode: 'ai' | 'hotseat' */
  constructor({ mode, difficulty = 'medium', human = 'w', name = 'You' }: { mode: 'ai' | 'hotseat'; difficulty?: Difficulty; human?: Color; name?: string }, onUpdate: () => void) {
    Object.assign(this, { mode, difficulty, human, name, onUpdate, gameNo: 1, thinking: false, links: null });
    this.game = new Game();
    if (mode === 'ai') {
      this.worker = new Worker(new URL('./ai/worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.aiMoved(e.data);
    }
  }
  start() { this.onUpdate(); this.maybeThink(); }
  snapshot(): Snapshot {
    const g = this.game, ai = this.mode === 'ai';
    const label = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[this.difficulty];
    const human = { id: 'me', name: this.name, connected: true }, bot = { id: 'ai', name: `AI (${label})`, connected: true };
    return {
      id: 'local', name: ai ? `vs AI - ${label}` : 'Pass & play', type: 'local', mode: this.mode, gameKey: 'local:' + this.gameNo,
      status: g.result ? 'finished' : 'playing', fen: g.fen(), turn: g.turn, history: g.history, result: g.result, check: g.check,
      players: ai ? { w: this.human === 'w' ? human : bot, b: this.human === 'b' ? human : bot } : { w: { id: 'p1', name: 'Player 1', connected: true }, b: { id: 'p2', name: 'Player 2', connected: true } },
      drawOffer: null, rematch: { w: false, b: false }, spectators: 0, myColor: ai ? this.human : null, thinking: this.thinking,
    };
  }
  canControl(color: Color): boolean {
    if (this.game.result || this.thinking) return false;
    return this.mode === 'ai' ? color === this.human : color === this.game.turn;
  }
  async move(m: GameMove) {
    if (!this.game.play(m)) throw new Error('Illegal move');
    this.onUpdate(); this.maybeThink();
  }
  maybeThink() {
    if (this.mode !== 'ai' || this.game.result || this.game.turn === this.human) return;
    this.thinking = true; this.onUpdate();
    this.t0 = Date.now();
    this.worker.postMessage({ id: this.gameNo, fen: this.game.fen(), difficulty: this.difficulty });
  }
  aiMoved({ id, move }: { id: number; move: GameMove | null }) {
    if (id !== this.gameNo) return;
    const wait = Math.max(0, 450 - (Date.now() - this.t0));
    setTimeout(() => {
      if (id !== this.gameNo) return;
      this.thinking = false;
      if (move) this.game.play(move);
      this.onUpdate();
    }, wait);
  }
  async resign() { this.game.result = { winner: other(this.mode === 'ai' ? this.human : this.game.turn), reason: 'resign' }; this.onUpdate(); }
  async rematch() {
    this.gameNo++; this.thinking = false; this.game = new Game();
    if (this.mode === 'ai') this.human = other(this.human);
    this.onUpdate(); this.maybeThink();
  }
  async offerDraw() {} async respondDraw() {}
  async leave() { this.worker?.terminate(); this.gameNo = -1; }
}
