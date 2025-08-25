// src/utils/inviteSms.ts
function tidyBase(s: string) { return s.replace(/\/+$/, '') }

const PAIR_BASE =
  (import.meta as any)?.env?.VITE_PAIR_BASE ||
  'http://192.168.1.20:1906';

function toE164ish(raw: string) {
  let s = (raw || '').trim().replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  return s;
}

export async function inviteSms(token: string, phone: string) {
  const base = tidyBase(PAIR_BASE);
  const url = `${base}/api/invite-sms`;

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ phone: toE164ish(phone) }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`invite failed: ${r.status} ${t}`);
  }
  return r.json() as Promise<{ ok: boolean; sent: number; total: number }>;
}
