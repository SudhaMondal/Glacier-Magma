import { io, type Socket } from 'socket.io-client';

export const SERVER = import.meta.env.VITE_SERVER_URL || '';
let socket: Socket | null = null;

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(SERVER + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

export function connect(token: string): Socket {
  if (socket) socket.disconnect();
  socket = io(SERVER || undefined, { auth: { token }, transports: ['websocket', 'polling'] });
  return socket;
}
export const getSocket = () => socket;
export const disconnect = () => { socket?.disconnect(); socket = null; };

export const emit = <T = any>(ev: string, data: unknown = {}) => new Promise<T>((res, rej) => {
  if (!socket) return rej(new Error('Not connected'));
  socket.timeout(8000).emit(ev, data, (err: unknown, r: any) => {
    if (err) return rej(new Error('Server did not respond'));
    if (r && r.ok === false) return rej(new Error(r.error));
    res(r || {});
  });
});

export const roomLink = (id: string, token?: string) => `${location.origin}${location.pathname}#/r/${id}${token ? '/' + token : ''}`;
