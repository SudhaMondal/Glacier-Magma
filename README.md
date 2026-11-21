# Glacier & Magma - Elemental Chess

Theatrical 3D chess in the browser. **White = Glacial Frost** (faceted refractive ice), **Black = Volcanic Magma**
(polished basalt marble veined with lava). Every move is a mini-scene: knights gallop and leap with a hoof-stomp
shockwave, pawns shatter into ice or crumble into embers, rooks slam into place, kings erupt or blizzard on checkmate.
Play worldwide against other people, watch live games, or play the computer.

**Written in TypeScript** (strict mode for the rules engine and server; gradual typing in the 3D client). CI type-checks, tests and builds every push.

## Features
- Full FIDE rules: castling, en passant, promotion (selector UI), check, checkmate, stalemate, insufficient material,
  threefold repetition, fifty-move rule, resignation, draw by agreement. The engine passes standard *perft* test suites.
- **Online multiplayer** with accounts (or guest login), server-authoritative moves (no cheating), reconnect support,
  rematch with colour swap, leaderboard.
- **Rooms** created by any logged-in player. Exactly two players per room; any number of read-only spectators.
- **AI opponent** (Easy / Medium / Hard) running in a Web Worker - no server load.
- **Pass & play** on one device.
- Procedural **adaptive audio** (no audio files): music that layers up as tension rises, elemental foley, ambience,
  mixer for Master / Music / SFX / Ambience, mute, and a **Turbo / instant moves** toggle.
- Graphics quality switch (High = refractive ice, Low = phone friendly).

## Room types
| Type | In lobby? | Who can take the 2nd seat | Who can watch |
|---|---|---|---|
| **Open invite** | Yes | Anyone | Anyone |
| **Arranged** | Yes | Only holders of the owner's invite link | Anyone |
| **Closed** | No (hidden) | Only holders of the invite link | Only holders of the watch (or invite) link |

Spectators cannot move, resign, offer draws, or chat (there is no chat). This is enforced **on the server**, not just hidden in the UI.
Invite/watch tokens are random 96-bit values; only the room owner ever receives them from the server.

## Quick start
```bash
npm install
npm run dev          # server :3001 + client http://localhost:5173
npm run typecheck    # TypeScript checks for all three packages
npm test             # engine perft + server integration tests
npm run build && npm start   # production mode on http://localhost:3001
```
Full deployment walkthrough: **[DEPLOY.md](DEPLOY.md)**.

## Structure
```
shared/   chess engine (rules, SAN, perft) + minimax AI (TypeScript) - used by BOTH server and client
server/   Express + Socket.IO: auth (scrypt + JWT), rooms, move validation, lobby, reconnect/abandon logic
client/   Vite + Three.js: scene, piece models, VFX/particles, procedural audio, UI
  src/three/  world.js (board, lights), pieces.js, vfx.js, view.js (choreography), textures.js
```

## Configuration (environment variables)
| Variable | Meaning |
|---|---|
| `PORT` | HTTP port (default 3001) |
| `JWT_SECRET` | **Required in production.** `openssl rand -hex 32` |
| `DATA_DIR` | Where `users.json` lives (mount a persistent disk) |
| `CLIENT_ORIGIN` | Comma-separated origins, only if the client is hosted on a different domain |
| `VITE_SERVER_URL` | (build time, client) URL of the server, only for split hosting |

## Known limitations / roadmap
- Rooms live in server memory: run **one** instance (see DEPLOY.md "Scaling"). Accounts are in a JSON file; swap `server/src/store.js` for Postgres to scale.
- No chess clocks yet (planned: per-room time controls).
- Visuals/audio are procedural and tuned for modern desktop + recent phones; use Low quality on older devices.
- Piece models are built from primitives; drop in glTF models in `client/src/three/pieces.js` for higher fidelity.

MIT licensed.
