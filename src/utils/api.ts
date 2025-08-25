function trimEnd(s: string) { return s.replace(/\/+$/, '') }
function trimStart(s: string) { return s.replace(/^\/+/, '') }
function join(a: string, b: string) { if (!a) return '/' + trimStart(b); return (trimEnd(a) + '/' + trimStart(b)).replace(/([^:]\/)\/+/, '$1') }

const API_ROOT = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
const CALL_BASE = (import.meta.env.VITE_CALL_BASE as string | undefined)
  ?? (import.meta.env.VITE_SOCKET_URL as string | undefined)
  ?? 'http://localhost:1906'

export async function registerPhone(phoneNumber: string, email:string, name: string, password: string) {
  const url = join(API_ROOT, '/register')
  const r = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ phoneNumber, email, name, password })
  })
  if (!r.ok) { const text = await r.text().catch(()=> ''); throw new Error('Register failed' + (text? ': '+text : '')) }
  return r.json()
}

export async function login(email: string, password: string) {
  const url = join(API_ROOT, '/login')
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) })
  if (!r.ok) throw new Error('Login failed')
  return r.json()
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

export async function getMessages(token: string, conversationId: string) {
  const url = join(API_ROOT, `/mobile/conversations/${conversationId}/messages`)
  const r = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } })
  if (!r.ok) throw new Error('Messages fetch failed')
  return r.json()
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
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) throw new Error('add_by_qr_failed')
  return res.json() as Promise<{ ok: boolean; already?: boolean; added?: boolean; contactId: string }>
}