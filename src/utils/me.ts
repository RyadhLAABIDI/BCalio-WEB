// src/utils/me.ts
const API_BASE = (import.meta as any)?.env?.VITE_API_BASE || '/api';

/**
 * Retourne le user courant à partir d’un Bearer token.
 * Essaie /mobile/me puis /user/me (selon ton back).
 */
export async function meWithToken(token: string) {
  const headers = { Authorization: `Bearer ${token}` };

  // essai 1: /mobile/me
  let r = await fetch(`${API_BASE}/mobile/me`, { headers });
  if (r.ok) return r.json();

  // essai 2: /user/me
  r = await fetch(`${API_BASE}/user/me`, { headers });
  if (r.ok) return r.json();

  throw new Error('Impossible de récupérer le profil avec ce token.');
}
