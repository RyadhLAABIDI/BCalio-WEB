// src/utils/pair.ts
export type IssueRes = {
  pairId: string;
  pairSecret: string;
  qr: string;
  ttlSeconds?: number;
  expiresAt?: number; // ms epoch si présent côté back
};

export type StateRes = {
  status: 'waiting' | 'attached' | 'consumed' | 'expired' | 'unknown';
  expiresAt?: number;
  attachedAt?: number | null;
  preview?: { userId?: string; name?: string; avatar?: string } | null;
};

export type ConsumeRes = {
  token: string;
  preview?: { userId?: string; name?: string; avatar?: string } | null;
};

// Base du serveur de pairing
const API_BASE =
  (import.meta as any)?.env?.VITE_PAIR_BASE ||
  'http://192.168.1.22:1906';

// ---- API ----
export async function issueWeb(): Promise<IssueRes> {
  const r = await fetch(`${API_BASE}/api/pair/issue-web`, { method: 'GET' });
  if (!r.ok) throw new Error(`issue-web failed: ${r.status}`);
  return r.json();
}

export async function getState(pairId: string, secret: string): Promise<StateRes> {
  const u = new URL(`${API_BASE}/api/pair/state`);
  u.searchParams.set('pairId', pairId);
  u.searchParams.set('secret', secret);
  const r = await fetch(u.toString(), { method: 'GET' });
  if (!r.ok) throw new Error(`state failed: ${r.status}`);
  return r.json();
}

export async function consume(pairId: string, secret: string): Promise<ConsumeRes> {
  const r = await fetch(`${API_BASE}/api/pair/consume`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ pairId, secret }),
  });
  if (!r.ok) throw new Error(`consume failed: ${r.status}`);
  return r.json();
}
