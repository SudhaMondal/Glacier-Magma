import type { Color, GameResult, HistoryEntry } from '@glacier-magma/shared';

export interface PlayerInfo { id: string; name: string; connected: boolean }
export interface Links { invite: string; watch: string; open: string }
export interface AuthState { token: string; user: { id: string; name: string; guest: boolean } }
export interface LobbyRoom {
  id: string; name: string; type: 'open' | 'arranged' | 'closed'; status: 'waiting' | 'playing' | 'finished';
  spectators: number; moves: number; players: Record<Color, string | null>; joinable: boolean;
}
export type GameMove = { from: number; to: number; promo?: string };

/** Everything the UI and 3D view need to render a game, whether it is online or local. */
export interface Snapshot {
  id: string; name: string; type: string; mode: 'online' | 'ai' | 'hotseat'; gameKey: string;
  status: 'waiting' | 'playing' | 'finished'; fen: string; turn: Color; history: HistoryEntry[];
  result: GameResult | null; check: boolean; players: Record<Color, PlayerInfo | null>; drawOffer: Color | null;
  rematch: Record<Color, boolean>; spectators: number; myColor: Color | null; thinking?: boolean; offline?: boolean;
  ownerId?: string; gameNo?: number;
}

export interface Session {
  links: Links | null;
  snapshot(): Snapshot;
  canControl(color: Color): boolean;
  move(m: GameMove): Promise<unknown>;
  resign(): Promise<unknown>;
  offerDraw(): Promise<unknown>;
  respondDraw(accept: boolean): Promise<unknown>;
  rematch(): Promise<unknown>;
  leave(): Promise<void>;
}
