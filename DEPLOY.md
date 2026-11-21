# Step-by-step deployment guide

You will: (1) run the game locally, (2) put it on GitHub, (3) deploy it on the internet so players worldwide can use it.
The whole app (website + live game server) is **one Node service**, so you only deploy one thing.

---
## Step 0 - Install the tools (once)
- **Node.js 20 or newer** - https://nodejs.org (check: `node -v`)
- **Git** - https://git-scm.com (check: `git --version`)
- A free **GitHub** account, and a free **Render** account (https://render.com) - or Fly.io / a VPS (see Step 6).

## Step 1 - Run it on your computer
```bash
unzip glacier-magma.zip && cd glacier-magma
npm install
npm run typecheck   # TypeScript: no errors
npm test            # should print: all tests pass
npm run dev
```
Open http://localhost:5173. Create a guest in one browser window and another guest in a **private/incognito window**:
1. Window A: *Create a room* -> Open invite.
2. Window B: the room appears in the lobby -> *Join game*. You are now playing yourself.
3. Open a third window, join as a viewer: the board is visible but nothing can be clicked.

## Step 2 - Put the project on GitHub
1. On github.com click **New repository**, name it `glacier-magma`, leave it empty (no README), click *Create*.
2. In the project folder:
```bash
git init -b main
git add .
git commit -m "Initial commit: Glacier & Magma"
git remote add origin https://github.com/<YOUR-USERNAME>/glacier-magma.git
git push -u origin main
```
(With the GitHub CLI instead: `gh repo create glacier-magma --public --source=. --push`.)
The included GitHub Action (`.github/workflows/ci.yml`) now runs the tests and builds on every push.

## Step 3 - Deploy on Render (recommended, simplest)
1. Render dashboard -> **New +** -> **Blueprint** -> connect GitHub -> choose `glacier-magma`.
2. Render reads `render.yaml`, shows one web service. Click **Apply**. It builds the Dockerfile (about 3-5 minutes)
   and auto-generates a secure `JWT_SECRET` for you.
3. When it says **Live**, open the `https://glacier-magma-xxxx.onrender.com` URL.
4. Check `https://<your-url>/healthz` returns `{"ok":true}`.

Manual alternative: **New + -> Web Service** -> pick the repo -> Runtime **Docker** -> add env vars
`NODE_ENV=production`, `JWT_SECRET=<output of: openssl rand -hex 32>`, `DATA_DIR=/data` -> Create.

**Free-plan caveats** - a free instance sleeps after ~15 min of no traffic (first visit takes ~30-60 s to wake) and its disk is
wiped on every deploy/restart, so *accounts reset and open rooms vanish*. For a real community use a paid instance and
enable the disk block in `render.yaml` (mount path `/data`) so `users.json` survives.

## Step 4 - Test it with real people
Send your URL to a friend in another country. Test each room type:
- **Open**: friend sees it in the lobby and joins.
- **Arranged**: click *Copy opponent invite link* and send it only to your opponent. A friend who opens the plain room sees a read-only board.
- **Closed**: the room never appears in the lobby. Send the *opponent invite link* to your opponent and the *viewer link* to the audience.
- **AI**: Lobby -> *Play the computer* -> Easy / Medium / Hard.

## Step 4b - Optional: also publish the website on GitHub Pages
GitHub Pages only hosts static files, so the live game server must still run on Render/Fly (Step 3/6). Then:
1. Repo -> Settings -> Pages -> Source: **GitHub Actions**.
2. Repo -> Settings -> Secrets and variables -> Actions -> **Variables** -> add `GAME_SERVER_URL` = your server URL.
3. On your server set `CLIENT_ORIGIN=https://<you>.github.io` (then redeploy).
4. Actions tab -> **Deploy client to GitHub Pages** -> Run workflow.

## Step 5 - Your own domain (optional)
Render -> your service -> **Settings -> Custom Domains** -> add `chess.yourdomain.com`, then create the CNAME record Render shows
at your DNS provider. HTTPS certificates are automatic. (WebSockets work over HTTPS with no extra setup.)

## Step 6 - Alternatives
**Fly.io** (good worldwide regions, persistent volume):
```bash
curl -L https://fly.io/install.sh | sh && fly auth login
fly launch --no-deploy --copy-config      # accept fly.toml, choose a unique app name
fly volumes create gm_data --size 1 --region sin
fly secrets set JWT_SECRET=$(openssl rand -hex 32)
fly deploy
```
**Any VPS (DigitalOcean, Hetzner, AWS Lightsail...)** with Docker:
```bash
git clone https://github.com/<you>/glacier-magma && cd glacier-magma
docker build -t glacier-magma .
docker run -d --restart=always -p 8080:8080 -v gm_data:/data -e JWT_SECRET=$(openssl rand -hex 32) glacier-magma
```
Put Caddy in front for free HTTPS: `chess.example.com { reverse_proxy localhost:8080 }`.

## Step 7 - Optional: host the website separately (Vercel/Netlify) from the game server
Only do this if you need it; the single-service setup is simpler.
1. Deploy the server (Step 3/6) and note its URL, e.g. `https://gm-server.onrender.com`. Set `CLIENT_ORIGIN=https://your-site.vercel.app` on the server.
2. On Vercel/Netlify create a project from the repo: root directory `client`, build command `cd .. && npm ci && npm run build -w client`,
   output `client/dist`, environment variable `VITE_SERVER_URL=https://gm-server.onrender.com`.

## Scaling and production hardening
- **One server instance only** for now: rooms live in memory. A single small instance comfortably handles hundreds of concurrent games
  (the server only validates moves; the AI and all 3D rendering run in each player's browser).
- To go beyond one instance: move room state to Redis, add the `@socket.io/redis-adapter`, enable sticky sessions at your load balancer,
  and replace `server/src/store.js` with Postgres.
- Already included: scrypt-hashed passwords, signed JWTs, rate limiting on auth, per-socket flood limit, strict input validation,
  Helmet security headers + CSP, server-side move legality, random unguessable invite tokens, auto-cleanup of idle rooms.
- Before launch: set a strong `JWT_SECRET`, keep it secret, back up `DATA_DIR`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Page loads but "Not connected" / login fails | Server not reachable: check `/healthz`; if split hosting, check `VITE_SERVER_URL` and `CLIENT_ORIGIN` (exact origin, no trailing slash). |
| Everyone logged out after a deploy | `JWT_SECRET` changed or missing - set a fixed value. |
| Accounts disappear after deploy | No persistent disk at `DATA_DIR`. |
| Black screen / no 3D | Browser has WebGL disabled; try Chrome/Edge/Firefox/Safari recent versions. Choose graphics quality *Low*. |
| No sound | Browsers block audio until you click once; click anywhere, then check Sound & display -> not muted. |
| Slow animation on phones | Sound & display -> Graphics quality = Low, or enable Turbo. |
