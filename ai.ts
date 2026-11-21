// Alpha-beta negamax AI with iterative deepening + quiescence. Runs in a Web Worker on the client.
import { pseudoMoves, applyMove, inCheck, type State, type Move } from './chess.js';

const VAL: Record<string, number> = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
const MATE = 100000;
export interface AIConfig { depth: number; timeMs: number; noise: number; quiesce: number }
export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTY: Record<Difficulty, AIConfig> = {
  easy:   { depth: 1, timeMs: 300,  noise: 170, quiesce: 0 },
  medium: { depth: 3, timeMs: 1200, noise: 22,  quiesce: 3 },
  hard:   { depth: 7, timeMs: 3200, noise: 0,   quiesce: 8 },
};

export function evaluate(st: State): number {
  let score = 0, material = 0;
  const b = st.board;
  for (let s = 0; s < 64; s++) if (b[s] && b[s].toLowerCase() !== 'p' && b[s].toLowerCase() !== 'k') material += VAL[b[s].toLowerCase()];
  const endgame = material < 2200;
  for (let s = 0; s < 64; s++) {
    const p = b[s];
    if (!p) continue;
    const white = p < 'a', t = p.toLowerCase(), f = s & 7, r = s >> 3, rr = white ? r : 7 - r;
    const centre = 7 - Math.abs(f - 3.5) - Math.abs(r - 3.5) - 0; // 0..7ish
    let v = VAL[t];
    if (t === 'p') v += rr * 9 + (f > 1 && f < 6 ? rr * 2 : 0) + (rr >= 5 ? rr * 6 : 0);
    else if (t === 'n') v += centre * 5 - (rr === 0 ? 10 : 0);
    else if (t === 'b') v += centre * 3 - (rr === 0 ? 8 : 0);
    else if (t === 'r') v += (rr === 6 ? 18 : 0) + (f >= 3 && f <= 4 ? 4 : 0);
    else if (t === 'q') v += centre * 1.2;
    else if (t === 'k') v += endgame ? centre * 7 : (rr === 0 ? 14 : -rr * 12) + (f <= 2 || f >= 6 ? 12 : 0);
    score += white ? v : -v;
  }
  return st.turn === 'w' ? score : -score;
}

const order = (moves: Move[]): Move[] => {
  for (const m of moves) m.o = (m.captured ? 10 * VAL[m.captured.toLowerCase()] - VAL[m.piece.toLowerCase()] + 1000 : 0) + (m.promo === 'q' ? 800 : 0) + (m.castle ? 30 : 0);
  return moves.sort((a, c) => (c.o ?? 0) - (a.o ?? 0));
};

export function findBestMove(st: State, level: Difficulty | AIConfig = 'medium'): { from: number; to: number; promo?: string } | null {
  const cfg: AIConfig = typeof level === 'string' ? DIFFICULTY[level] || DIFFICULTY.medium : level;
  const deadline = Date.now() + cfg.timeMs;
  let nodes = 0, abortable = false;
  const TIMEOUT = {};

  function quiesce(s: State, alpha: number, beta: number, qd: number): number {
    const stand = evaluate(s);
    if (qd <= 0 || stand >= beta) return stand >= beta ? beta : Math.max(alpha, stand);
    if (stand > alpha) alpha = stand;
    const us = s.turn;
    for (const m of order(pseudoMoves(s).filter((x) => x.captured || x.promo === 'q'))) {
      const ns = applyMove(s, m, false);
      if (inCheck(ns, us)) continue;
      const sc = -quiesce(ns, -beta, -alpha, qd - 1);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function negamax(s: State, depth: number, alpha: number, beta: number, ply: number): number {
    if ((++nodes & 1023) === 0 && abortable && Date.now() > deadline) throw TIMEOUT;
    if (s.half >= 100) return 0;
    if (depth <= 0) return cfg.quiesce ? quiesce(s, alpha, beta, cfg.quiesce) : evaluate(s);
    const us = s.turn;
    let best = -Infinity, legal = 0;
    for (const m of order(pseudoMoves(s))) {
      const ns = applyMove(s, m, false);
      if (inCheck(ns, us)) continue;
      legal++;
      const sc = -negamax(ns, depth - 1, -beta, -alpha, ply + 1);
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    if (!legal) return inCheck(s, us) ? -MATE + ply : 0;
    return best;
  }

  const us = st.turn;
  const root = order(pseudoMoves(st).filter((m) => !inCheck(applyMove(st, m, false), us)));
  if (!root.length) return null;
  let scores = root.map(() => 0);
  for (let d = 1; d <= cfg.depth; d++) {
    abortable = d > 1;
    try {
      const cur: number[] = [];
      let alpha = -Infinity;
      for (const m of root) {
        const sc = -negamax(applyMove(st, m, false), d - 1, -Infinity, -(cfg.noise ? -Infinity : alpha), 1);
        cur.push(sc);
        if (!cfg.noise && sc > alpha) alpha = sc;
      }
      scores = cur;
      // put best move first for next iteration
      const bi = scores.indexOf(Math.max(...scores));
      [root[0], root[bi]] = [root[bi], root[0]]; [scores[0], scores[bi]] = [scores[bi], scores[0]];
      if (scores[0] > MATE - 100) break;
    } catch (e) { if (e !== TIMEOUT) throw e; break; }
    if (Date.now() > deadline) break;
  }
  let bi = 0, bs = -Infinity;
  scores.forEach((sc, i) => {
    const v = sc + (cfg.noise ? (Math.random() + Math.random() - 1) * cfg.noise : 0);
    if (v > bs) { bs = v; bi = i; }
  });
  const m = root[bi]!;
  return { from: m.from, to: m.to, promo: m.promo };
}
