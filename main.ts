import './style.css';
import { fromFEN, legalMoves, colorOf, type Difficulty } from '@glacier-magma/shared';
import { api, connect, disconnect, emit, getSocket, SERVER } from './net.js';
import { OnlineSession, LocalSession } from './session.js';
import type { AuthState, LobbyRoom, Session, Snapshot } from './types.js';
import { audio } from './audio.js';
import { GameView } from './three/view.js';

const $app = document.getElementById('app')!, $stage = document.getElementById('stage')!, $toasts = document.getElementById('toasts')!;
const settings = { turbo: localStorage.getItem('gm_turbo') === '1', quality: localStorage.getItem('gm_quality') || 'high' };
// `auth`, `view`, `session` and `hud` are null while idle; guarded at the call sites that can run before they exist.
let auth: AuthState = null as any, view: GameView = null as any, session: Session = null as any, curKey: string | null = null, sel = -1;
let targets: { sq: number; capture: boolean }[] = [] as { sq: number; capture: boolean }[], lobbyHandler: ((l: LobbyRoom[]) => void) | null = null, rooms: LobbyRoom[] = [];
try { auth = JSON.parse(localStorage.getItem('gm_auth') || 'null'); } catch { /* ignore */ }

const h = (tag: string, props: Record<string, any> | null = {}, ...kids: any[]): any => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
const mount = (...nodes: Node[]) => { $app.replaceChildren(...nodes); };
function toast(msg: string, kind = 'info') {
  const t = h('div', { class: 'toast ' + kind }, msg); $toasts.append(t); setTimeout(() => t.remove(), 4200);
}
const copy = async (text: string, label = 'Link copied') => {
  try { await navigator.clipboard.writeText(text); toast(label); } catch { prompt('Copy this link:', text); }
};
const ELEMENT: Record<'w' | 'b', { icon: string; name: string; sub: string }> = { w: { icon: '❄', name: 'Glacier', sub: 'Glacial Frost · White' }, b: { icon: '🔥', name: 'Magma', sub: 'Volcanic Magma · Black' } };
const REASON: Record<string, string> = { checkmate: 'Checkmate', stalemate: 'Stalemate', insufficient: 'Insufficient material', threefold: 'Threefold repetition', fifty: 'Fifty-move rule', resign: 'Resignation', agreement: 'Draw by agreement', abandoned: 'Opponent left the game' };
const TYPE_INFO: Record<string, string[]> = {
  open: ['Open invite', 'Listed in the lobby. The first challenger to join takes the second seat.'],
  arranged: ['Arranged', 'Listed for viewers, but only someone with your invite link can play.'],
  closed: ['Closed', 'Hidden from the lobby. Players need the invite link, viewers need the watch link.'],
};

// Never fail silently: show any crash on screen.
function fatal(msg: string) {
  console.error(msg);
  if (!$app.querySelector('main, .hud')) $app.replaceChildren(h('main', { class: 'center' }, h('section', { class: 'panel' }, h('h2', {}, 'Something went wrong'), h('p', { class: 'err' }, msg), h('p', { class: 'hint' }, 'Try reloading. If it persists, check the browser console (F12).'))));
  else toast(msg, 'err');
}
addEventListener('error', (e) => fatal(e.message));
addEventListener('unhandledrejection', (e) => fatal(String(e.reason?.message || e.reason)));

// ---------------- auth ----------------
function saveAuth(r: AuthState) { auth = r; localStorage.setItem('gm_auth', JSON.stringify(r)); startSocket(); route(); }
function startSocket() {
  const s = connect(auth.token);
  s.on('connect_error', (e) => { if (e.message === 'auth') { toast('Session expired - sign in again', 'err'); logout(); } });
}
function logout() { stopGame(); disconnect(); auth = null as any; localStorage.removeItem('gm_auth'); showAuth(); }

function showAuth() {
  stopGame();
  let tab = 'login';
  const err = h('p', { class: 'err' });
  const note = h('p', { class: 'note' });
  fetch(SERVER + '/healthz', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('bad'); }).catch(() => {
    note.textContent = location.hostname.endsWith('github.io') && !SERVER
      ? 'This copy is hosted on GitHub Pages, which cannot run the live game server, so sign-in and online play will not work. Deploy the server (DEPLOY.md, Step 3), then rebuild this site with the GAME_SERVER_URL variable set. You can still try the computer opponent after the server is connected.'
      : `Cannot reach the game server at ${SERVER || location.origin}. Check that it is running and that CLIENT_ORIGIN on the server matches this site's address.`;
  });
  const draw = () => {
    const name = h('input', { placeholder: tab === 'guest' ? 'Pick a display name' : 'Username', maxlength: 20, autocomplete: 'username' });
    const pass = h('input', { type: 'password', placeholder: 'Password', autocomplete: tab === 'login' ? 'current-password' : 'new-password' });
    const go = async () => {
      err.textContent = ''; audio.init();
      try {
        if (tab === 'guest') saveAuth(await api('/api/guest', { name: name.value }));
        else saveAuth(await api(tab === 'login' ? '/api/login' : '/api/register', { username: name.value, password: pass.value }));
      } catch (e) { err.textContent = e.message; }
    };
    for (const i of [name, pass]) i.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    mount(h('main', { class: 'center' }, h('section', { class: 'panel auth' },
      h('h1', { class: 'title' }, 'Glacier & Magma'),
      h('p', { class: 'tag' }, 'Chess where ice meets fire. Play anyone, anywhere.'),
      h('div', { class: 'tabs' }, ['login', 'register', 'guest'].map((t) => h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; draw(); } }, { login: 'Sign in', register: 'Create account', guest: 'Play as guest' }[t]))),
      note, name, tab === 'guest' ? null : pass, err,
      h('button', { class: 'primary', onclick: go }, tab === 'login' ? 'Sign in' : tab === 'register' ? 'Create account' : 'Enter as guest'),
      tab === 'guest' ? h('p', { class: 'hint' }, 'Guests can play and watch, but are not on the leaderboard.') : null)));
    name.focus();
  };
  draw();
}

// ---------------- lobby ----------------
async function showLobby() {
  stopGame(); history.replaceState(null, '', location.pathname);
  const list = h('div', { class: 'rooms' }), board = h('ol', { class: 'lb' });
  const linkIn = h('input', { placeholder: 'Paste an invite or watch link' });
  const renderRooms = () => {
    list.replaceChildren(...(rooms.length ? rooms.map((r) => h('article', { class: 'room' },
      h('div', {}, h('h3', {}, r.name), h('p', { class: 'meta' },
        h('span', { class: 'badge ' + r.type }, TYPE_INFO[r.type][0]), ` ❄ ${r.players.w || '—'}  vs  🔥 ${r.players.b || '—'} · ${r.spectators} watching`)),
      h('button', { class: r.joinable ? 'primary' : '', onclick: () => { location.hash = '#/r/' + r.id; } }, r.joinable ? 'Join game' : r.status === 'waiting' ? 'Watch (invite only)' : 'Watch'))) : [h('p', { class: 'empty' }, 'No public rooms yet. Create one and invite a friend, or play the AI.')]));
  };
  mount(h('main', { class: 'lobby' },
    h('header', {}, h('h1', { class: 'title sm' }, 'Glacier & Magma'), h('div', { class: 'who' }, h('span', {}, auth.user.name + (auth.user.guest ? ' (guest)' : '')),
      h('button', { onclick: openSettings }, 'Sound & display'), h('button', { onclick: logout }, 'Sign out'))),
    h('div', { class: 'cols' },
      h('section', { class: 'panel' }, h('h2', {}, 'Play'),
        h('button', { class: 'primary', onclick: openCreate }, 'Create a room'),
        h('button', { onclick: openAI }, 'Play the computer'),
        h('button', { onclick: () => startLocal({ mode: 'hotseat', name: auth.user.name }) }, 'Pass & play on one device'),
        h('div', { class: 'join' }, linkIn, h('button', { onclick: () => { const v = linkIn.value.trim(), m = v.match(/#\/r\/([\w-]+(?:\/[\w-]+)?)/) || v.match(/^([\w-]+(?:\/[\w-]+)?)$/); if (m) location.hash = '#/r/' + m[1]; else toast('That does not look like a room link', 'err'); } }, 'Open link')),
        h('h2', {}, 'Top players'), board),
      h('section', { class: 'panel grow' }, h('h2', {}, 'Rooms'), list))));
  renderRooms();
  api('/api/leaderboard').then((l) => board.replaceChildren(...(l.length ? l.map((p) => h('li', {}, `${p.name} — ${p.wins}W ${p.losses}L ${p.draws}D`)) : [h('li', { class: 'empty' }, 'Sign in with an account to appear here.')]))).catch(() => {});
  try {
    await ensureSocket();
    const r = await emit('lobby:subscribe'); rooms = r.rooms; renderRooms();
    lobbyHandler = (l: LobbyRoom[]) => { rooms = l; renderRooms(); }; getSocket()!.on('lobby:list', lobbyHandler);
  } catch (e) { toast(e.message, 'err'); }
}
const ensureSocket = () => new Promise<void>((res, rej) => {
  const s = getSocket(); if (!s) return rej(new Error('Not connected'));
  if (s.connected) return res(); s.once('connect', () => res()); s.once('connect_error', rej);
});
function leaveLobby() { if (lobbyHandler) { getSocket()?.off('lobby:list', lobbyHandler as any); lobbyHandler = null; getSocket()?.emit('lobby:unsubscribe'); } }

function modal(title: string, body: Node) {
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay', onclick: (e) => e.target === ov && close() }, h('section', { class: 'panel modal' }, h('h2', {}, title), body, h('button', { class: 'ghost', onclick: close }, 'Close')));
  document.body.append(ov); return { close };
}
const radio = (name: string, opts: string[][], val: string) => h('div', { class: 'radios' }, opts.map(([v, label, desc]) => h('label', {}, h('input', { type: 'radio', name, value: v, checked: v === val }), h('span', {}, h('b', {}, label), desc ? h('small', {}, desc) : null))));
const picked = (root: ParentNode, name: string) => root.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)?.value;

function openCreate() {
  const name = h('input', { placeholder: `${auth.user.name}'s room`, maxlength: 40 });
  const f = h('div', { class: 'form' }, h('label', {}, 'Room name', name),
    h('p', { class: 'lbl' }, 'Who can join?'), radio('type', Object.entries(TYPE_INFO).map(([k, [l, d]]) => [k, l, d]), 'open'),
    h('p', { class: 'lbl' }, 'You play as'), radio('color', [['w', '❄ Glacier (White)'], ['b', '🔥 Magma (Black)'], ['random', 'Random']], 'random'));
  const m = modal('Create a room', f);
  f.append(h('button', { class: 'primary', onclick: async () => {
    try { const r = await emit('room:create', { name: name.value, type: picked(f, 'type'), color: picked(f, 'color') }); m.close(); location.hash = '#/r/' + r.roomId; } catch (e) { toast(e.message, 'err'); }
  } }, 'Create room'));
}
function openAI() {
  const f = h('div', { class: 'form' }, h('p', { class: 'lbl' }, 'Difficulty'),
    radio('diff', [['easy', 'Easy', 'Looks one move ahead and makes human-like mistakes'], ['medium', 'Medium', 'Thinks a few moves ahead'], ['hard', 'Hard', 'Searches deep with tactics - a real challenge']], 'medium'),
    h('p', { class: 'lbl' }, 'You play as'), radio('color', [['w', '❄ Glacier (White)'], ['b', '🔥 Magma (Black)'], ['random', 'Random']], 'w'));
  const m = modal('Play the computer', f);
  f.append(h('button', { class: 'primary', onclick: () => { let c = picked(f, 'color'); if (c === 'random') c = Math.random() < 0.5 ? 'w' : 'b'; m.close(); startLocal({ mode: 'ai', difficulty: picked(f, 'diff') as Difficulty, human: c as 'w' | 'b', name: auth.user.name }); } }, 'Start game'));
}
function openSettings() {
  const sl = (k: 'master' | 'music' | 'sfx' | 'amb', label: string) => h('label', {}, label, h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: audio.v[k], oninput: (e) => audio.setVol(k, +e.target.value) }));
  audio.init();
  modal('Sound & display', h('div', { class: 'form' },
    h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: audio.muted, onchange: (e) => audio.setMuted(e.target.checked) }), 'Mute everything'),
    sl('master', 'Master'), sl('music', 'Music'), sl('sfx', 'Sound effects'), sl('amb', 'Ambience'),
    h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: settings.turbo, onchange: (e) => { settings.turbo = e.target.checked; localStorage.setItem('gm_turbo', settings.turbo ? '1' : '0'); } }), 'Turbo / instant moves (skips animations)'),
    h('label', {}, 'Graphics quality', h('select', { onchange: (e) => { settings.quality = e.target.value; localStorage.setItem('gm_quality', settings.quality); view?.applyQuality(); } },
      ['high', 'low'].map((q) => h('option', { value: q, selected: settings.quality === q }, q === 'high' ? 'High (refractive ice)' : 'Low (best for phones)'))))));
}

// ---------------- routing ----------------
function route() {
  if (!auth) return showAuth();
  const m = location.hash.match(/^#\/r\/([\w-]+)(?:\/([\w-]+))?/);
  if (m) enterOnline(m[1], m[2]); else showLobby();
}
addEventListener('hashchange', () => { if (auth) route(); });

async function enterOnline(id: string, token?: string) {
  leaveLobby(); stopGame();
  try {
    await ensureSocket();
    let s; s = new OnlineSession(auth.user, id, token, () => { if (session === s) refresh(); }, (reason) => { toast(reason || 'Room closed', 'err'); if (session === s) { stopGame(); location.hash = ''; showLobby(); } });
    await s.join(); startGame(s);
  } catch (e) { toast(e.message, 'err'); history.replaceState(null, '', location.pathname); showLobby(); }
}
function startLocal(opts: ConstructorParameters<typeof LocalSession>[0]) {
  leaveLobby(); stopGame(); let s; s = new LocalSession(opts, () => { if (session === s) refresh(); });
  startGame(s); s.start();
}

// ---------------- game screen ----------------
let hud: any = null;
function startGame(s: Session) {
  leaveLobby(); session = s; curKey = null; sel = -1; targets = [];
  audio.init(); audio.startMusic();
  if (!view) {
    view = new GameView($stage, { audio, settings });
    view.onSquare = onSquare;
    view.onApplied = (snap) => { audio.setTension(view.tension, snap.turn); drawHighlights(); };
  }
  $stage.classList.add('on'); document.body.classList.add('ingame'); view.start(); buildHud(); refresh();
}
function stopGame() {
  if (session) { const s = session; session = null as any; s.leave(); }
  view?.stop(); $stage.classList.remove('on'); document.body.classList.remove('ingame'); audio.stopMusic(); document.querySelectorAll('.overlay').forEach((o) => o.remove());
}
function leaveGame() {
  const s = session.snapshot();
  if (s.mode === 'online' && s.myColor && s.status === 'playing' && !confirm('Leave this game? Your opponent wins if you are gone for 90 seconds. You can come back using the same link.')) return;
  stopGame(); history.replaceState(null, '', location.pathname); showLobby();
}

function buildHud() {
  const card = () => ({ el: h('div', { class: 'pcard' }), icon: h('span', { class: 'icon' }), name: h('b'), sub: h('small'), dot: h('i', { class: 'dot' }) });
  hud = { top: card(), bot: card(), status: h('p', { class: 'status' }), moves: h('ol', { class: 'moves' }), notice: h('div', { class: 'notice' }), links: h('div', { class: 'links' }), ctrl: h('div', { class: 'ctrl' }), title: h('span', { class: 'rname' }), watch: h('span', { class: 'watchers' }) };
  for (const c of [hud.top, hud.bot]) c.el.append(c.icon, h('div', { class: 'pn' }, c.name, c.sub), c.dot);
  mount(h('aside', { class: 'hud' },
    h('div', { class: 'bar' }, h('button', { onclick: leaveGame }, '← Lobby'), hud.title, h('button', { onclick: openSettings, 'aria-label': 'Settings' }, '⚙')),
    hud.top.el, hud.status, hud.moves, hud.bot.el, hud.notice, hud.ctrl, hud.links, hud.watch));
}
const nameOf = (s: Snapshot, c: 'w' | 'b') => s.players[c]?.name || ELEMENT[c].name;
function resultText(s: Snapshot) {
  const r = s.result; if (!r) return '';
  return (r.winner ? `${ELEMENT[r.winner].name} wins — ${nameOf(s, r.winner)}` : 'Draw') + ' · ' + REASON[r.reason];
}

function refresh() {
  if (!session || !hud) return;
  const s = session.snapshot(), orient = s.myColor || 'w';
  if (s.gameKey !== curKey) { curKey = s.gameKey; view.setOrientation(orient); sel = -1; targets = []; document.querySelector('.overlay.end')?.remove(); }
  if (s.turn !== (refresh as any).turn) { sel = -1; targets = []; (refresh as any).turn = s.turn; }
  view.sync(s);
  hud.title.textContent = s.name;
  const fill = (c, color) => {
    const p = s.players[color];
    c.icon.textContent = ELEMENT[color].icon; c.name.textContent = (p?.name || 'Waiting…') + (s.myColor === color ? ' (you)' : '');
    c.sub.textContent = ELEMENT[color].sub; c.dot.className = 'dot ' + (p ? (p.connected ? 'on' : 'off') : '');
    c.el.className = 'pcard ' + (color === 'w' ? 'ice' : 'magma') + (s.status === 'playing' && s.turn === color ? ' turn' : '');
  };
  const top = orient === 'w' ? 'b' : 'w'; fill(hud.top, top); fill(hud.bot, orient);
  hud.status.textContent = s.status === 'waiting' ? 'Waiting for an opponent to join…' : s.status === 'finished' ? resultText(s) : `${nameOf(s, s.turn)}'s move${s.thinking ? ' (thinking…)' : ''}${s.check ? ' — check!' : ''}`;
  hud.status.className = 'status' + (s.check && s.status === 'playing' ? ' check' : '');
  const rows: any[] = []; for (let i = 0; i < s.history.length; i += 2) rows.push(h('li', {}, h('span', {}, s.history[i].san), h('span', {}, s.history[i + 1]?.san || '')));
  hud.moves.replaceChildren(...rows); hud.moves.scrollTop = 1e6;
  // notices
  const n: any[] = [];
  if (s.offline) n.push(h('p', { class: 'warn' }, 'Connection lost - reconnecting…'));
  if (s.mode === 'online' && !s.myColor) n.push(h('p', { class: 'spec' }, 'You are watching. Viewers can look around the board but cannot play.'));
  if (s.mode === 'online' && s.myColor && s.status === 'playing' && !s.players[s.myColor === 'w' ? 'b' : 'w']?.connected) n.push(h('p', { class: 'warn' }, 'Your opponent disconnected. They have 90 seconds to return.'));
  if (s.drawOffer && s.myColor && s.drawOffer !== s.myColor && s.status === 'playing') n.push(h('div', { class: 'offer' }, 'Your opponent offers a draw. ', h('button', { onclick: () => session.respondDraw(true) }, 'Accept'), h('button', { onclick: () => session.respondDraw(false) }, 'Decline')));
  hud.notice.replaceChildren(...n);
  // controls (players only)
  const c: any[] = [];
  const canPlay = !!s.myColor || s.mode === 'ai' || s.mode === 'hotseat';
  if (s.status === 'playing' && canPlay) {
    c.push(h('button', { onclick: () => confirm('Resign this game?') && session.resign().catch((e) => toast(e.message, 'err')) }, 'Resign'));
    if (s.mode === 'online') c.push(h('button', { onclick: () => session.offerDraw().then(() => toast('Draw offered')).catch((e) => toast(e.message, 'err')), disabled: s.drawOffer === s.myColor }, s.drawOffer === s.myColor ? 'Draw offered' : 'Offer draw'));
  }
  c.push(h('label', { class: 'turbo' }, h('input', { type: 'checkbox', checked: settings.turbo, onchange: (e) => { settings.turbo = e.target.checked; localStorage.setItem('gm_turbo', settings.turbo ? '1' : '0'); } }), 'Turbo'));
  hud.ctrl.replaceChildren(...c);
  // owner links
  const L = session.links, l: any[] = [];
  if (L) {
    const type = s.type, info = TYPE_INFO[type];
    l.push(h('p', { class: 'lbl' }, info[0] + ' room'));
    if (type === 'open') l.push(h('button', { onclick: () => copy(L.open, 'Invite link copied') }, 'Copy invite link'));
    else { l.push(h('button', { class: 'primary', onclick: () => copy(L.invite, 'Opponent link copied') }, 'Copy opponent invite link'), h('button', { onclick: () => copy(type === 'closed' ? L.watch : L.open, 'Viewer link copied') }, 'Copy viewer link')); }
  }
  hud.links.replaceChildren(...l);
  hud.watch.textContent = s.mode === 'online' ? `${s.spectators} watching` : '';
  if (s.status === 'finished') showEnd(s); else document.querySelector('.overlay.end')?.remove();
}
(refresh as any).turn = null;

function showEnd(s: Snapshot) {
  if (document.querySelector('.overlay.end')) { updateEndButtons(s); return; }
  setTimeout(() => {
    if (!session || session.snapshot().status !== 'finished' || document.querySelector('.overlay.end')) return;
    audio.play('end');
    const ov = h('div', { class: 'overlay end', onclick: (e) => e.target === ov && ov.remove() }, h('section', { class: 'panel modal' }, h('h2', {}, resultText(session.snapshot())), h('div', { class: 'endbtns' })));
    document.body.append(ov); updateEndButtons(session.snapshot());
  }, view?.processing || s.result?.reason === 'checkmate' ? 4500 : 900);
}
function updateEndButtons(s: Snapshot) {
  const box = document.querySelector('.overlay.end .endbtns'); if (!box) return;
  const kids: any[] = [];
  if (s.mode !== 'online' || s.myColor) {
    const mine = s.myColor ? s.rematch?.[s.myColor] : false, theirs = s.rematch?.[s.myColor === 'w' ? 'b' : 'w'];
    kids.push(h('button', { class: 'primary', disabled: !!mine, onclick: () => session.rematch().catch((e) => toast(e.message, 'err')) }, s.mode === 'online' ? (mine ? 'Waiting for opponent…' : theirs ? 'Accept rematch' : 'Rematch (swap colours)') : 'Play again'));
  }
  kids.push(h('button', { onclick: leaveGame }, 'Back to lobby'));
  box.replaceChildren(...kids);
}

// ---------------- board interaction ----------------
let legalCache: { fen: string; moves: ReturnType<typeof legalMoves> } = { fen: '', moves: [] };
const getLegal = (fen: string) => (legalCache.fen === fen ? legalCache.moves : (legalCache = { fen, moves: legalMoves(fromFEN(fen)) }).moves);
function drawHighlights() {
  if (!view || !session) return;
  const s = session.snapshot();
  view.setHighlights({ selected: sel, targets, last: view.lastMove || [], el: s.turn === 'w' ? 'ice' : 'magma' });
}
async function onSquare(sq: number) {
  if (!session || view.processing) return;
  const s = session.snapshot(); if (s.status !== 'playing') return;
  if (!session.canControl(s.turn)) { if (s.myColor && s.myColor !== s.turn) audio.play('invalid'); return; }
  const legal = getLegal(s.fen), piece = fromFEN(s.fen).board[sq];
  if (sel >= 0) {
    const mv = legal.filter((m) => m.from === sel && m.to === sq);
    if (mv.length) {
      let promo; if (mv[0].promo) promo = await askPromo(s.turn);
      sel = -1; targets = []; drawHighlights();
      try { await session.move({ from: mv[0].from, to: mv[0].to, promo }); } catch (e) { toast(e.message, 'err'); audio.play('invalid'); }
      return;
    }
  }
  if (piece && colorOf(piece) === s.turn) {
    sel = sq; targets = legal.filter((m) => m.from === sq).map((m) => ({ sq: m.to, capture: !!m.captured }));
    audio.play('select', { el: s.turn === 'w' ? 'ice' : 'magma' });
  } else { if (sel >= 0) audio.play('invalid'); sel = -1; targets = []; }
  drawHighlights();
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && sel >= 0) { sel = -1; targets = []; drawHighlights(); } });
function askPromo(color: 'w' | 'b'): Promise<string> {
  return new Promise((res) => {
    const g = { q: '♛', r: '♜', b: '♝', n: '♞' };
    const ov = h('div', { class: 'overlay' }, h('section', { class: 'panel modal promo' }, h('h2', {}, 'Promote your pawn'),
      h('div', { class: 'promos ' + (color === 'w' ? 'ice' : 'magma') }, Object.entries(g).map(([k, v]) => h('button', { onclick: () => { ov.remove(); res(k); }, title: { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[k] }, v)))));
    document.body.append(ov);
  });
}
document.addEventListener('pointerdown', () => audio.init(), { once: true });

// boot
if (auth) { startSocket(); route(); } else showAuth();
