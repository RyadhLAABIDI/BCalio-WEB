// src/utils/contactsSync.ts
import { myContacts } from './api';

export type SplitContactsRes = {
  inApp: Array<{ id: string; name?: string; email?: string; image?: string; phoneNumber?: string | null }>;
  phoneOnly: Array<{ name?: string; phoneNumber: string }>;
  refreshedAt: number;
};

function tidyBase(s: string) { return s.replace(/\/+$/, '') }

const PAIR_BASE =
  (import.meta as any)?.env?.VITE_PAIR_BASE ||
  'http://192.168.1.22:1906';

/**
 * Appelle /api/contacts/merged sur ton serveur local, et adapte la
 * réponse { registered, phoneOnly, updatedAt } -> { inApp, phoneOnly, refreshedAt }.
 * Fallback propre : si 404/erreur, on renvoie au moins la liste app (myContacts).
 */
export async function splitContacts(token: string): Promise<SplitContactsRes> {
  const base = tidyBase(PAIR_BASE);

  // 1) endpoint officiel (ton backend actuel)
  const url = `${base}/api/contacts/merged`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const data = await r.json();
      return {
        inApp: Array.isArray(data.registered) ? data.registered : [],
        phoneOnly: Array.isArray(data.phoneOnly) ? data.phoneOnly : [],
        refreshedAt: Number(data.updatedAt || Date.now()),
      };
    }
    // 2) si 404, essayer sans /api (au cas où)
    if (r.status === 404) {
      const r2 = await fetch(`${base}/contacts/merged`, { headers: { Authorization: `Bearer ${token}` } });
      if (r2.ok) {
        const data = await r2.json();
        return {
          inApp: Array.isArray(data.registered) ? data.registered : [],
          phoneOnly: Array.isArray(data.phoneOnly) ? data.phoneOnly : [],
          refreshedAt: Number(data.updatedAt || Date.now()),
        };
      }
    }
  } catch (_) {
    // on dégrade juste en dessous
  }

  // 3) dégradation : au moins la liste app (pas de téléphone)
  const inApp = await myContacts(token).catch(() => [] as any[]);
  return {
    inApp,
    phoneOnly: [],
    refreshedAt: Date.now(),
  };
}
