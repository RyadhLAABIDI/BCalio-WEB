function trimEnd(s: string) { return s.replace(/\/+$/, '') }
function trimStart(s: string) { return s.replace(/^\/+/, '') }
function join(a: string, b: string) { if (!a) return '/' + trimStart(b); return (trimEnd(a) + '/' + trimStart(b)).replace(/([^:]\/)\/+/, '$1') }

const API_ROOT = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
const CALL_BASE = (import.meta.env.VITE_CALL_BASE as string | undefined)
  ?? (import.meta.env.VITE_SOCKET_URL as string | undefined)
  ?? 'https://backendcall.b-callio.com'

export function setStoredCreds(email: string, password: string) {
  localStorage.setItem('email', email)
  localStorage.setItem('password', password)
}
export function getStoredCreds() {
  return { email: localStorage.getItem('email') || '', password: localStorage.getItem('password') || '' }
}

export async function registerPhone(phoneNumber: string, email:string, name: string, password: string) {
  const url = join(API_ROOT, '/register')
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phoneNumber, email, name, password }) })
  if (!r.ok) { const text = await r.text().catch(()=> ''); throw new Error('Register failed' + (text? ': '+text : '')) }
  return r.json()
}

export async function login(email: string, password: string) {
  const url = join(API_ROOT, '/login')
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) })
  if (!r.ok) throw new Error('Login failed')
  const data = await r.json()
  try { setStoredCreds(email, password) } catch {}
  return data
}

export async function getUsers(token: string) {
  const url = join(API_ROOT, '/mobile/users')
  const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } })
  if (!r.ok) throw new Error('Users fetch failed')
  return r.json()
}

export async function myContacts(token: string) {
  const url = join(API_ROOT, '/mobile/contacts/me')
  const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } })
  if (!r.ok) throw new Error('Contacts fetch failed')
  return r.json()
}

export async function addContact(token: string, contactId: string) {
  const url = join(API_ROOT, '/mobile/contacts')
  const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ contactId }) })
  if (!r.ok) throw new Error('Add contact failed')
  return r.json()
}

export async function myConversations(token: string) {
  const url = join(API_ROOT, '/mobile/conversations')
  const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } })
  if (!r.ok) throw new Error('Conversations fetch failed')
  return r.json()
}

export async function createOneToOne(token: string, userId: string) {
  const url = join(API_ROOT, '/mobile/conversations')
  const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ isGroup: false, userId }) })
  if (!r.ok) throw new Error('Create 1-1 failed')
  return r.json()
}

export async function createGroup(token: string, name: string, logo: string, memberIds: string[]) {
  const url = join(API_ROOT, '/mobile/conversations')
  const members = memberIds.map(id => ({ value: id }))
  const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ isGroup: true, name, logo, members }) })
  if (!r.ok) throw new Error('Create group failed')
  return r.json()
}

/* ---------- helpers mapping (réutilisés) ---------- */
function pickArray(payload: any): any[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (payload?.data?.items && Array.isArray(payload.data.items)) return payload.data.items
  if (Array.isArray(payload?.messages)) return payload.messages
  return []
}
function mapMessage(m: any) {
  return {
    id: String(m?.id ?? m?._id ?? ''),
    senderId: String(m?.senderId ?? m?.sender_id ?? m?.from ?? ''),
    body: m?.body ?? m?.text ?? m?.content ?? '',
    image: m?.image ?? m?.image_url ?? m?.media_url ?? '',
    audio: m?.audio ?? m?.audio_url ?? '',
    createdAt: m?.createdAt ?? m?.created_at ?? m?.time ?? m?.timestamp ?? Date.now(),
  }
}

/* ---------- EXISTANT: renvoie juste un array mappé (simple) ---------- */
export async function getMessages(
  token: string,
  conversationId: string,
  options?: {
    take?: number
    beforeId?: string
    afterId?: string
    since?: Date
    until?: Date
    includeSender?: boolean
    includeSeen?: boolean
  }
) {
  if (!token || !conversationId) throw new Error('Messages fetch failed: missing token/conversationId')

  const {
    take = 30,
    beforeId,
    afterId,
    since,
    until,
    includeSender = true,
    includeSeen = false,
  } = options || {}

  const qp = new URLSearchParams()
  qp.set('take', String(Math.max(1, Math.min(200, take))))
  if (beforeId) qp.set('beforeId', beforeId)
  if (afterId) qp.set('afterId', afterId)
  if (since) qp.set('since', since.toISOString())
  if (until) qp.set('until', until.toISOString())
  qp.set('includeSender', String(includeSender))
  qp.set('includeSeen', String(includeSeen))

  const base = join(API_ROOT, `/mobile/conversations/${conversationId}/messages`)
  const url = qp.toString() ? `${base}?${qp.toString()}` : base

  const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } })
  if (!r.ok) throw new Error('Messages fetch failed')

  const payload = await r.json()
  const arr = pickArray(payload).map(mapMessage)
  return arr
}

/* ---------- NOUVEAU: renvoie { data, meta } pour la pagination ---------- */
export async function getMessagesPage(
  token: string,
  conversationId: string,
  opts?: {
    take?: number
    beforeId?: string
    afterId?: string
    since?: Date
    until?: Date
    includeSender?: boolean
    includeSeen?: boolean
  }
): Promise<{ data: any[]; meta: { count: number; hasMoreBefore: boolean; hasMoreAfter: boolean; nextBeforeId: string|null; nextAfterId: string|null } }> {
  const arr = await getMessages(token, conversationId, opts)
  // On refait un 2e fetch pour meta SI le backend ne renvoie pas meta par défaut.
  // → Mais comme on ne casse rien côté back, on simule une meta basique s’il n’y en a pas.
  // Si ton backend renvoie déjà {data, meta}, adapte ici pour lire la vraie meta à partir de la réponse (facile).
  return {
    data: arr,
    meta: {
      count: arr.length,
      hasMoreBefore: Boolean(opts?.beforeId ? true : true), // on laisse true par défaut; le flux réel viendra des next ids
      hasMoreAfter: false,
      nextBeforeId: arr.length ? String(arr[0].id) : null,   // par convention on utilise le 1er id comme pivot "before"
      nextAfterId: arr.length ? String(arr[arr.length - 1].id) : null,
    }
  }
}

export async function sendMessage(token: string, conversationId: string, body: string, image?: string, audio?: string) {
  const url = join(API_ROOT, '/mobile/messages')
  const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ message: body, image: image||'', audio: audio||'', conversationId }) })
  if (!r.ok) throw new Error('Send failed')
  return r.json()
}

export async function markSeen(token: string, conversationId: string) {
  const url = join(API_ROOT, `/mobile/conversations/${conversationId}/seen`)
  const r = await fetch(url, { method:'POST', headers:{ Authorization:`Bearer ${token}` } })
  if (!r.ok) throw new Error('Seen failed')
  return r.json()
}

export async function uploadFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`${CALL_BASE}/api/upload`, { method:'POST', body: fd })
  if (!r.ok) throw new Error('Upload failed')
  const data = await r.json()
  return data.url as string
}

export async function getMyQrToken(userId: string) {
  const res = await fetch(`${API_ROOT}/qr/me`, { headers: { 'x-user-id': userId } })
  if (!res.ok) throw new Error('qr_me_failed')
  return res.json() as Promise<{ token: string; text: string; expSeconds: number }>
}

export async function addByQrToken(userId: string, token: string) {
  const res = await fetch(`${API_ROOT}/contacts/add-by-qr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) throw new Error('add_by_qr_failed')
  return res.json() as Promise<{ ok: boolean; already?: boolean; added?: boolean; contactId: string }>
}
