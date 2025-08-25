// src/utils/contacts.ts
export type MergedRes = {
  ok: boolean
  updatedAt?: number | null
  counts: { registered: number; phoneOnly: number }
  registered: {
    id: string | null
    name: string
    phoneNumber: string
    image?: string | null
    email?: string | null
  }[]
  phoneOnly: {
    name?: string | null
    phoneNumber: string
  }[]
}

const BASE =
  (import.meta as any)?.env?.VITE_PAIR_BASE ||
  (window as any)?.PAIR_BASE ||
  'http://localhost:1906'

export async function getMergedContacts(token: string): Promise<MergedRes> {
  const r = await fetch(`${BASE}/api/contacts/merged`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new Error(`merged failed: ${r.status}`)
  return r.json()
}
