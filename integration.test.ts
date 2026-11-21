import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';
import { createServer } from '../src/index.js';
import { sqIndex } from '@glacier-magma/shared';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-'));
const { server } = createServer({ dataDir: dir });
await new Promise<void>((r) => server.listen(0, () => r()));
const base = `http://localhost:${(server.address() as { port: number }).port}`;

async function guest(name: string) {
  const r = await fetch(base + '/api/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  const { token, user } = (await r.json()) as { token: string; user: { id: string; name: string } };
  const s = ioc(base, { auth: { token }, transports: ['websocket'] });
  await new Promise<void>((res, rej) => { s.on('connect', () => res()); s.on('connect_error', rej); });
  const emit = (ev: string, d?: unknown) => new Promise<any>((res) => s.emit(ev, d, res));
  return { s, emit, user };
}
const mv = (a: string, b: string) => ({ from: sqIndex(a), to: sqIndex(b) });

test('accounts: register + login + wrong password', async () => {
  const post = (p: string, b: unknown) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  assert.equal((await post('/api/register', { username: 'alice_1', password: 'secret1' })).status, 200);
  assert.equal((await post('/api/register', { username: 'alice_1', password: 'secret1' })).status, 400);
  assert.equal((await post('/api/login', { username: 'alice_1', password: 'secret1' })).status, 200);
  assert.equal((await post('/api/login', { username: 'alice_1', password: 'nope' })).status, 401);
});

test('open room: two players, spectator is read-only, server validates moves', async () => {
  const [a, b, c] = await Promise.all([guest('A'), guest('B'), guest('C')]);
  const { roomId } = await a.emit('room:create', { name: 'T', type: 'open', color: 'w' });
  const ja = await a.emit('room:join', { roomId });
  assert.equal(ja.role, 'player'); assert.ok(ja.links.invite);
  const jb = await b.emit('room:join', { roomId });
  assert.equal(jb.role, 'player'); assert.equal(jb.links, undefined);
  assert.equal(jb.state.status, 'playing');
  const jc = await c.emit('room:join', { roomId });
  assert.equal(jc.role, 'spectator'); assert.equal(jc.links, undefined);
  // spectator cannot do anything
  for (const ev of ['game:move', 'game:resign', 'game:offerDraw']) assert.equal((await c.emit(ev, mv('e2', 'e4'))).ok, false);
  // wrong turn / illegal
  assert.equal((await b.emit('game:move', mv('e7', 'e5'))).ok, false);
  assert.equal((await a.emit('game:move', mv('e2', 'e5'))).ok, false);
  const seen = new Promise<any>((res) => c.s.once('room:state', res));
  assert.equal((await a.emit('game:move', mv('e2', 'e4'))).ok, true);
  const st = await seen;
  assert.equal(st.history.length, 1); assert.equal(st.turn, 'b');
  // third person can't take a seat in a full room
  const d = await guest('D');
  assert.equal((await d.emit('room:join', { roomId })).role, 'spectator');
  const fin = new Promise<any>((res) => c.s.once('room:state', res));
  assert.equal((await b.emit('game:resign')).ok, true);
  assert.deepEqual((await fin).result, { winner: 'w', reason: 'resign' });
  for (const x of [a, b, c, d]) x.s.close();
});

test('arranged room: opponent seat needs invite token; anyone can watch', async () => {
  const [a, b, c] = await Promise.all([guest('A'), guest('B'), guest('C')]);
  const { roomId } = await a.emit('room:create', { name: 'Arr', type: 'arranged', color: 'b' });
  const { links } = await a.emit('room:join', { roomId });
  const jb = await b.emit('room:join', { roomId });
  assert.equal(jb.role, 'spectator');
  const jb2 = await b.emit('room:join', { roomId, token: links.invite });
  assert.equal(jb2.role, 'player'); assert.equal(jb2.color, 'w');
  assert.equal((await c.emit('room:join', { roomId, token: links.invite })).role, 'spectator');
  for (const x of [a, b, c]) x.s.close();
});

test('closed room: unlisted, link required to watch or play', async () => {
  const [a, b, c, d] = await Promise.all([guest('A'), guest('B'), guest('C'), guest('D')]);
  const { roomId } = await a.emit('room:create', { name: 'Secret', type: 'closed', color: 'w' });
  const { links } = await a.emit('room:join', { roomId });
  const lobby = await d.emit('lobby:subscribe');
  assert.ok(!lobby.rooms.some((r: { id: string }) => r.id === roomId));
  assert.equal((await b.emit('room:join', { roomId })).ok, false);
  assert.equal((await b.emit('room:join', { roomId, token: 'p_wrong' })).ok, false);
  assert.equal((await b.emit('room:join', { roomId, token: links.invite })).role, 'player');
  const jc = await c.emit('room:join', { roomId, token: links.watch });
  assert.equal(jc.role, 'spectator');
  assert.equal((await c.emit('game:move', mv('e2', 'e4'))).ok, false);
  for (const x of [a, b, c, d]) x.s.close();
});

test.after(() => { server.close(); setTimeout(() => process.exit(0), 100); });
