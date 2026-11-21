import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Server, type Socket } from 'socket.io';
import { Store } from './store.js';
import { authRouter, verifyToken } from './auth.js';
import { RoomManager } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const origins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const DIST = process.env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist');

export function createServer({ dataDir = process.env.DATA_DIR || './data' }: { dataDir?: string } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'", 'ws:', 'wss:', ...origins],
        workerSrc: ["'self'", 'blob:'], fontSrc: ["'self'", 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  if (origins.length) app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '4kb' }));

  const store = new Store(dataDir);
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api', authRouter(store));
  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST, { maxAge: '1h', index: 'index.html' }));
  } else app.get('/', (_req, res) => res.send('Glacier & Magma server is running. Build the client (npm run build) or use npm run dev.'));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: origins.length ? { origin: origins } : undefined,
    maxHttpBufferSize: 1e4, pingInterval: 20000, pingTimeout: 20000,
  });
  io.use((socket: Socket, next) => {
    try { socket.data.user = verifyToken(socket.handshake.auth?.token); next(); } catch { next(new Error('auth')); }
  });
  const rooms = new RoomManager(io, store);
  io.on('connection', (socket: Socket) => {
    // simple flood protection: max 30 events / 5s per socket
    let bucket = 30, last = Date.now();
    socket.use((_packet, next) => {
      const now = Date.now(); bucket = Math.min(30, bucket + ((now - last) / 5000) * 30); last = now;
      if (bucket < 1) return next(new Error('Slow down'));
      bucket--; next();
    });
    rooms.attach(socket as Parameters<RoomManager['attach']>[0]);
  });
  return { app, server, io, rooms, store };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createServer();
  server.listen(PORT, () => console.log(`Glacier & Magma server listening on :${PORT}`));
}
