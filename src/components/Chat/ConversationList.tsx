import React, { useMemo } from 'react'

type Presence = { online?: boolean; lastSeen?: number | null }

type Props = {
  items: any[]
  currentId: string | null
  onSelect: (id: string) => void
  presence?: Record<string, Presence>
  /** Ton ID (optionnel). Utilisé si l’item n’a pas c.selfId. */
  myId?: string
}

function pickOtherUser(c: any, myId?: string) {
  const users: any[] = Array.isArray(c?.users) ? c.users : []
  if (!users.length) return undefined
  const self = c?.selfId ?? myId
  const other = users.find((u) => u && u.id !== self) ?? users[0]
  return other
}

function pickTitle(c: any, myId?: string) {
  if (c?.isGroup) return c?.name || 'Group'
  const other = pickOtherUser(c, myId)
  return other?.name || 'Direct'
}

/** Essaie plusieurs clés d'avatar, y compris des objets { url } */
function extractAvatar(obj: any): string {
  if (!obj) return ''
  const candidates = [
    obj.avatar,
    obj.avatarUrl,
    obj.photo,
    obj.photoUrl,
    obj.picture,
    obj.image,
    obj.imageUrl,
    obj.icon,
    obj.profile?.avatar,
    obj.profileImageUrl,
    obj.profilePic,
    obj.logo, // au cas où côté conv 1-1
  ]
  for (const v of candidates) {
    if (!v) continue
    if (typeof v === 'string') return v
    if (typeof v === 'object' && typeof v.url === 'string') return v.url
  }
  return ''
}

function pickAvatar(c: any, myId?: string) {
  if (c?.isGroup) return extractAvatar(c) // logo / avatar du groupe
  const other = pickOtherUser(c, myId)
  return extractAvatar(other)
}

function pickPreview(c: any) {
  const p = c?.lastPreview
  if (p && typeof p === 'string') return p
  const m = c?.lastMessage || {}
  return (m.body ?? m.text ?? m.content ?? '').toString()
}

function pickTime(c: any) {
  const ts =
    c?.lastAt ??
    c?.updatedAt ??
    c?.lastTs ??
    c?.lastMessage?.createdAt ??
    null
  if (!ts) return ''
  const d = new Date(ts)
  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000
  if (now - d.getTime() < oneDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString()
}

function getSortKey(c: any) {
  return new Date(
    c?.lastAt ?? c?.updatedAt ?? c?.lastTs ?? c?.lastMessage?.createdAt ?? 0
  ).getTime()
}

const ConversationList: React.FC<Props> = ({
  items,
  currentId,
  onSelect,
  presence = {},
  myId,
}) => {
  const sorted = useMemo(() => {
    const arr = Array.isArray(items) ? [...items] : []
    arr.sort((a, b) => getSortKey(b) - getSortKey(a))
    return arr
  }, [items])

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {sorted.map((c) => {
        const id = c?.id
        const selected = currentId === id

        const other = pickOtherUser(c, myId)
        const pres = other?.id ? presence[other.id] : undefined

        const title = pickTitle(c, myId)
        const avatar = pickAvatar(c, myId)
        const preview = pickPreview(c) || (c?.isGroup ? 'No messages yet' : 'Say hello 👋')
        const time = pickTime(c)
        const unread = Number(c?.unreadCount ?? 0)

        // Initiales pour fallback visuel
        const initials = (title || '')
          .split(/\s+/)
          .map((w: string) => w[0])
          .filter(Boolean)
          .slice(0, 2)
          .join('')
          .toUpperCase()

        return (
          <button
            key={id}
            onClick={() => id && onSelect(id)}
            className={[
              'w-full text-left rounded-xl px-3 py-2 transition',
              'border',
              selected
                ? 'bg-[var(--panel)]/70 border-[var(--primary)] shadow-[0_0_0_2px_rgba(0,0,0,0.05)]'
                : 'bg-[var(--bg-soft)]/50 border-[var(--border)] hover:bg-[var(--panel)]/60 hover:border-[var(--border)]',
            ].join(' ')}
          >
            <div className="flex items-center gap-3">
              {/* Avatar : on affiche TOUJOURS des initiales en fond,
                  et l'image vient au-dessus ; si elle casse → on la cache */}
              <div className="relative w-10 h-10">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--primary-700)] to-[var(--primary)] text-white grid place-items-center border border-[var(--border)]">
                  <span className="text-sm font-semibold">{initials || '??'}</span>
                </div>
                {avatar && (
                  <img
                    src={avatar}
                    alt={title}
                    className="absolute inset-0 w-10 h-10 rounded-full object-cover border border-[var(--border)]"
                    onError={(e) => {
                      // si l'image échoue, on la masque → on voit les initiales derrière
                      (e.currentTarget as HTMLImageElement).style.display = 'none'
                    }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}

                {/* pastille online seulement pour 1–1 */}
                {!c?.isGroup && other && (
                  <span
                    className={[
                      'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2',
                      'border-[var(--bg-soft)]',
                      pres?.online ? 'bg-green-400' : 'bg-gray-500',
                    ].join(' ')}
                    title={pres?.online ? 'online' : 'offline'}
                  />
                )}
              </div>

              {/* contenu */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={[
                      'truncate font-medium',
                      selected ? 'text-[var(--primary)]' : 'text-[var(--fg)]',
                    ].join(' ')}
                    title={title}
                  >
                    {title}
                  </div>

                  {c?.isGroup && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--panel)] border border-[var(--border)] uppercase tracking-wider opacity-70">
                      Group
                    </span>
                  )}

                  <div className="ml-auto text-[11px] opacity-60">{time}</div>
                </div>

                <div className="mt-0.5 flex items-center gap-2">
                  <div
                    className="text-xs opacity-75 truncate max-w-[18ch]"
                    title={preview}
                  >
                    {preview}
                  </div>

                  {!!unread && (
                    <span className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/90 text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        )
      })}

      {!sorted.length && (
        <div className="px-3 py-6 text-sm opacity-70">
          Aucune conversation. Lance une discussion ➕
        </div>
      )}
    </div>
  )
}

export default ConversationList
