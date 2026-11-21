// Complete FIDE chess rules engine (pure JS, no dependencies).
// Squares are 0..63 with a1=0, h1=7, a8=56, h8=63. Pieces: uppercase = white, lowercase = black.
export type Color = 'w' | 'b';
export interface CastleRights { K: boolean; Q: boolean; k: boolean; q: boolean }
export interface State { board: string[]; turn: Color; castle: CastleRights; ep: number; half: number; full: number; keys: string[] }
export interface Move { from: number; to: number; piece: string; captured?: string; promo?: string; ep?: boolean; double?: boolean; castle?: 'K' | 'Q'; o?: number }
export interface Status { over: boolean; winner?: Color | null; reason?: string; check: boolean }
export interface GameResult { winner: Color | null; reason: string }
export interface HistoryEntry { color: Color; from: number; to: number; promo: string | null; san: string; piece: string; captured: string | null; ep: boolean; castle: 'K' | 'Q' | null; check: boolean; mate: boolean }

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
export const sqName = (s: number): string => FILES[s & 7] + ((s >> 3) + 1);
export const sqIndex = (n: string): number => n.charCodeAt(0) - 97 + (n.charCodeAt(1) - 49) * 8;
export const colorOf = (p: string | undefined): Color | null => (!p ? null : p < 'a' ? 'w' : 'b');
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KD = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const RD = KD.slice(0, 4);
const BD = KD.slice(4);
const CORNERS: Record<number, 'K' | 'Q' | 'k' | 'q'> = { 0: 'Q', 7: 'K', 56: 'q', 63: 'k' };

const castleStr = (c: CastleRights): string => (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '') || '-';
export const posKey = (st: State): string => st.board.map((p) => p || '1').join('') + st.turn + castleStr(st.castle) + st.ep;

export function fromFEN(fen: string): State {
  const [pl, turn = 'w', cs = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const board = new Array(64).fill('');
  pl.split('/').forEach((row, i) => {
    let f = 0;
    const r = 7 - i;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') f += +ch;
      else board[r * 8 + f++] = ch;
    }
  });
  const st: State = {
    board, turn: turn as Color,
    castle: { K: cs.includes('K'), Q: cs.includes('Q'), k: cs.includes('k'), q: cs.includes('q') },
    ep: ep === '-' ? -1 : sqIndex(ep), half: +half, full: +full, keys: [],
  };
  st.keys = [posKey(st)];
  return st;
}

export function toFEN(st: State): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = st.board[r * 8 + f];
      if (!p) empty++;
      else { if (empty) { row += empty; empty = 0; } row += p; }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${st.turn} ${castleStr(st.castle)} ${st.ep < 0 ? '-' : sqName(st.ep)} ${st.half} ${st.full}`;
}

export function isAttacked(board: string[], s: number, by: Color): boolean {
  const f = s & 7, r = s >> 3, w = by === 'w';
  const pr = w ? r - 1 : r + 1;
  if (pr >= 0 && pr < 8) {
    const pc = w ? 'P' : 'p';
    if (f > 0 && board[pr * 8 + f - 1] === pc) return true;
    if (f < 7 && board[pr * 8 + f + 1] === pc) return true;
  }
  const n = w ? 'N' : 'n', k = w ? 'K' : 'k', b = w ? 'B' : 'b', ro = w ? 'R' : 'r', q = w ? 'Q' : 'q';
  for (const [df, dr] of KN) { const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && board[nr * 8 + nf] === n) return true; }
  for (const [df, dr] of KD) { const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && board[nr * 8 + nf] === k) return true; }
  for (const [df, dr] of BD) {
    let nf = f + df, nr = r + dr;
    while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
      const p = board[nr * 8 + nf];
      if (p) { if (p === b || p === q) return true; break; }
      nf += df; nr += dr;
    }
  }
  for (const [df, dr] of RD) {
    let nf = f + df, nr = r + dr;
    while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
      const p = board[nr * 8 + nf];
      if (p) { if (p === ro || p === q) return true; break; }
      nf += df; nr += dr;
    }
  }
  return false;
}

export function inCheck(st: State, color: Color): boolean {
  const k = st.board.indexOf(color === 'w' ? 'K' : 'k');
  return k >= 0 && isAttacked(st.board, k, other(color));
}

export function pseudoMoves(st: State): Move[] {
  const { board, turn: us } = st;
  const them = other(us);
  const out: Move[] = [];
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p || colorOf(p) !== us) continue;
    const t = p.toLowerCase(), f = s & 7, r = s >> 3;
    if (t === 'p') {
      const dir = us === 'w' ? 1 : -1, startR = us === 'w' ? 1 : 6, lastR = us === 'w' ? 7 : 0, r1 = r + dir;
      if (r1 < 0 || r1 > 7) continue;
      const add = (to: number, extra: Partial<Move>) => {
        if (to >> 3 === lastR) for (const pr of 'qrbn') out.push({ from: s, to, piece: p, promo: pr, ...extra });
        else out.push({ from: s, to, piece: p, ...extra });
      };
      if (!board[r1 * 8 + f]) {
        add(r1 * 8 + f, {});
        if (r === startR && !board[(r + 2 * dir) * 8 + f]) out.push({ from: s, to: (r + 2 * dir) * 8 + f, piece: p, double: true });
      }
      for (const df of [-1, 1]) {
        const nf = f + df;
        if (nf < 0 || nf > 7) continue;
        const to = r1 * 8 + nf, tp = board[to];
        if (tp && colorOf(tp) !== us) add(to, { captured: tp });
        else if (!tp && to === st.ep) out.push({ from: s, to, piece: p, captured: us === 'w' ? 'p' : 'P', ep: true });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [df, dr] of t === 'n' ? KN : KD) {
        const nf = f + df, nr = r + dr;
        if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
        const to = nr * 8 + nf, tp = board[to];
        if (!tp) out.push({ from: s, to, piece: p });
        else if (colorOf(tp) !== us) out.push({ from: s, to, piece: p, captured: tp });
      }
    } else {
      const dirs = t === 'b' ? BD : t === 'r' ? RD : KD;
      for (const [df, dr] of dirs) {
        let nf = f + df, nr = r + dr;
        while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
          const to = nr * 8 + nf, tp = board[to];
          if (!tp) out.push({ from: s, to, piece: p });
          else { if (colorOf(tp) !== us) out.push({ from: s, to, piece: p, captured: tp }); break; }
          nf += df; nr += dr;
        }
      }
    }
  }
  // castling
  const base = us === 'w' ? 0 : 56, K = us === 'w' ? 'K' : 'k', R = us === 'w' ? 'R' : 'r';
  if (board[base + 4] === K && !isAttacked(board, base + 4, them)) {
    if (st.castle[K] && board[base + 7] === R && !board[base + 5] && !board[base + 6] &&
      !isAttacked(board, base + 5, them) && !isAttacked(board, base + 6, them))
      out.push({ from: base + 4, to: base + 6, piece: K, castle: 'K' });
    const qk = us === 'w' ? 'Q' : 'q';
    if (st.castle[qk] && board[base] === R && !board[base + 1] && !board[base + 2] && !board[base + 3] &&
      !isAttacked(board, base + 3, them) && !isAttacked(board, base + 2, them))
      out.push({ from: base + 4, to: base + 2, piece: K, castle: 'Q' });
  }
  return out;
}

export function applyMove(st: State, m: Move, track = true): State {
  const us = st.turn;
  const b = st.board.slice();
  const p = b[m.from];
  b[m.from] = '';
  if (m.ep) b[us === 'w' ? m.to - 8 : m.to + 8] = '';
  b[m.to] = m.promo ? (us === 'w' ? m.promo.toUpperCase() : m.promo) : p;
  if (m.castle) {
    const base = us === 'w' ? 0 : 56;
    const [rf, rt] = m.castle === 'K' ? [base + 7, base + 5] : [base, base + 3];
    b[rt] = b[rf]; b[rf] = '';
  }
  const castle = { ...st.castle };
  for (const s of [m.from, m.to]) {
    if (CORNERS[s]) castle[CORNERS[s]] = false;
    if (s === 4) { castle.K = false; castle.Q = false; }
    if (s === 60) { castle.k = false; castle.q = false; }
  }
  const ns: State = {
    board: b, turn: other(us), castle,
    ep: m.double ? (m.from + m.to) / 2 : -1,
    half: p.toLowerCase() === 'p' || m.captured ? 0 : st.half + 1,
    full: st.full + (us === 'b' ? 1 : 0), keys: st.keys,
  };
  if (track) ns.keys = [...st.keys, posKey(ns)];
  return ns;
}

export function legalMoves(st: State): Move[] {
  const us = st.turn;
  return pseudoMoves(st).filter((m) => !inCheck(applyMove(st, m, false), us));
}

function insufficient(board: string[]): boolean {
  const minors: { t: string; sc: number }[] = [];
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p) continue;
    const t = p.toLowerCase();
    if (t === 'k') continue;
    if (t === 'p' || t === 'r' || t === 'q') return false;
    minors.push({ t, sc: ((s & 7) + (s >> 3)) & 1 });
  }
  if (minors.length <= 1) return true;
  return minors.every((m) => m.t === 'b' && m.sc === minors[0].sc);
}

export function gameStatus(st: State, legal: Move[] = legalMoves(st)): Status {
  const check = inCheck(st, st.turn);
  if (!legal.length) return check ? { over: true, winner: other(st.turn), reason: 'checkmate', check } : { over: true, winner: null, reason: 'stalemate', check };
  if (insufficient(st.board)) return { over: true, winner: null, reason: 'insufficient', check };
  const last = st.keys[st.keys.length - 1];
  if (st.keys.filter((k) => k === last).length >= 3) return { over: true, winner: null, reason: 'threefold', check };
  if (st.half >= 100) return { over: true, winner: null, reason: 'fifty', check };
  return { over: false, check };
}

export function sanOf(st: State, m: Move, legal: Move[] = legalMoves(st)): string {
  let s: string;
  if (m.castle) s = m.castle === 'K' ? 'O-O' : 'O-O-O';
  else {
    const t = m.piece.toUpperCase(), to = sqName(m.to);
    if (t === 'P') s = (m.captured ? FILES[m.from & 7] + 'x' : '') + to + (m.promo ? '=' + m.promo.toUpperCase() : '');
    else {
      let dis = '';
      const others = legal.filter((o) => o !== m && o.piece === m.piece && o.to === m.to);
      if (others.length) {
        const sameFile = others.some((o) => (o.from & 7) === (m.from & 7));
        const sameRank = others.some((o) => (o.from >> 3) === (m.from >> 3));
        dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String((m.from >> 3) + 1) : sqName(m.from);
      }
      s = t + dis + (m.captured ? 'x' : '') + to;
    }
  }
  const ns = applyMove(st, m, false);
  if (inCheck(ns, ns.turn)) s += legalMoves(ns).length ? '+' : '#';
  return s;
}

export function perft(st: State, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(st)) n += depth === 1 ? 1 : perft(applyMove(st, m, false), depth - 1);
  return n;
}

/** Stateful game wrapper used by the server and the local (AI / pass-and-play) sessions. */
export class Game {
  state: State;
  history: HistoryEntry[] = [];
  result: GameResult | null = null;
  check = false;
  constructor(fen: string = START_FEN) { this.state = fromFEN(fen); }
  get turn(): Color { return this.state.turn; }
  legal(): Move[] { return legalMoves(this.state); }
  /** @returns history entry or null if illegal */
  play({ from, to, promo }: { from: number; to: number; promo?: string | null }): HistoryEntry | null {
    if (this.result) return null;
    if (promo && !'qrbn'.includes(promo)) return null;
    const legal = legalMoves(this.state);
    const m = legal.find((x) => x.from === from && x.to === to && (!x.promo || x.promo === (promo || 'q')));
    if (!m) return null;
    const color = this.state.turn;
    const san = sanOf(this.state, m, legal);
    this.state = applyMove(this.state, m);
    const status = gameStatus(this.state);
    this.check = status.check;
    const entry: HistoryEntry = {
      color, from: m.from, to: m.to, promo: m.promo || null, san, piece: m.piece, captured: m.captured || null,
      ep: !!m.ep, castle: m.castle || null, check: status.check, mate: status.reason === 'checkmate',
    };
    this.history.push(entry);
    if (status.over) this.result = { winner: status.winner ?? null, reason: status.reason! };
    return entry;
  }
  fen(): string { return toFEN(this.state); }
}
