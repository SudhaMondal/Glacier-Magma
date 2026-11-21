import test from 'node:test';
import assert from 'node:assert/strict';
import { fromFEN, START_FEN, perft, Game, sqIndex, gameStatus, legalMoves, toFEN, findBestMove } from '../index.js';

test('perft start position', () => {
  const s = fromFEN(START_FEN);
  assert.equal(perft(s, 1), 20); assert.equal(perft(s, 2), 400); assert.equal(perft(s, 3), 8902); assert.equal(perft(s, 4), 197281);
});
test('perft kiwipete (castling, ep, promotion mixes)', () => {
  const s = fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(s, 1), 48); assert.equal(perft(s, 2), 2039); assert.equal(perft(s, 3), 97862);
});
test('perft position 3 (en passant pins)', () => {
  const s = fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.equal(perft(s, 4), 43238);
});
test('perft position 5', () => {
  const s = fromFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  assert.equal(perft(s, 3), 62379);
});
test('fool\'s mate is checkmate', () => {
  const g = new Game();
  for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) assert.ok(g.play({ from: sqIndex(f), to: sqIndex(t) }));
  assert.deepEqual(g.result, { winner: 'b', reason: 'checkmate' });
  assert.equal(g.history.at(-1)!.san, 'Qh4#');
});
test('stalemate', () => {
  const s = fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(gameStatus(s).reason, 'stalemate');
});
test('insufficient material', () => {
  assert.equal(gameStatus(fromFEN('8/8/4k3/8/8/3K4/8/8 w - - 0 1')).reason, 'insufficient');
});
test('threefold repetition', () => {
  const g = new Game();
  const seq = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
  for (let i = 0; i < 2; i++) for (const [f, t] of seq) g.play({ from: sqIndex(f), to: sqIndex(t) });
  assert.equal(g.result?.reason, 'threefold');
});
test('illegal move rejected, promotion default queen', () => {
  const g2 = new Game('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const e = g2.play({ from: sqIndex('a7'), to: sqIndex('a8') });
  assert.equal(e!.promo, 'q');
  assert.equal(new Game().play({ from: sqIndex('e2'), to: sqIndex('e5') }), null);
});
test('AI finds mate in one (all levels with depth>=2)', () => {
  const s = fromFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const m = findBestMove(s, 'hard');
  assert.equal(m!.from, sqIndex('a1')); assert.equal(m!.to, sqIndex('a8'));
});
test('AI easy returns a legal move quickly', () => {
  const s = fromFEN(START_FEN);
  const m = findBestMove(s, 'easy');
  assert.ok(legalMoves(s).some((x) => x.from === m!.from && x.to === m!.to));
});
