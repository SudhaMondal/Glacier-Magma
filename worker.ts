import { fromFEN, findBestMove, type Difficulty } from '@glacier-magma/shared';
self.onmessage = (e: MessageEvent<{ id: number; fen: string; difficulty: Difficulty }>) => {
  const { id, fen, difficulty } = e.data;
  let move: ReturnType<typeof findBestMove> = null;
  try { move = findBestMove(fromFEN(fen), difficulty); } catch (err) { console.error(err); }
  self.postMessage({ id, move });
};
