// src/roomkit/config.ts
const env = (import.meta as any).env || {};

// Default to same host with port 1906 (adjust if needed)
const DEFAULT_BASE = `${window.location.protocol}//${window.location.hostname}:1906`;

// Pick the server base in this priority order:
// VITE_ROOM_SERVER_BASE > VITE_SOCKET_URL > VITE_PAIR_BASE > DEFAULT_BASE
const rawBase: string =
  env.VITE_ROOM_SERVER_BASE ??
  env.VITE_SOCKET_URL ??
  env.VITE_PAIR_BASE ??
  DEFAULT_BASE;

// Normalize (no trailing slash)
const BASE = rawBase.replace(/\/+$/, '');

// ✅ exports you can import elsewhere
export const ROOM_SERVER_BASE = BASE;            // e.g. http://192.168.1.135:1906
export const ROOM_NS_URL      = `${BASE}/room`;  // Socket.IO namespace
export const API_BASE         = `${BASE}/api`;   // REST base (used by /random-id, etc.)
