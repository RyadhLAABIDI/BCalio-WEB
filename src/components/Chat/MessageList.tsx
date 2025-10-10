import React, { useEffect, useRef } from 'react'

type Msg = {
  id?: string
  senderId: string
  body?: string
  image?: string
  audio?: string
  createdAt?: string | number
}

const isVideoUrl = (url?: string) =>
  !!url && (/(\.mp4|\.webm|\.ogg|\.mov|\.m3u8)(\?|$)/i.test(url) || url.includes('/video/'))

const TypingBubble: React.FC<{ names: string[] }> = ({ names }) => (
  <div className="px-4 py-2">
    <div className="inline-flex items-center gap-2 rounded-full bg-[var(--panel)]/70 backdrop-blur-sm px-3 py-1.5 shadow-[0_0_20px_rgba(255,149,0,.25)]">
      <span className="text-xs opacity-90">
        {names.join(', ')} {names.length > 1 ? 'are' : 'is'} typing
      </span>
      <span className="flex items-end gap-1 ml-1">
        <span className="dot"></span>
        <span className="dot delay-150"></span>
        <span className="dot delay-300"></span>
      </span>
    </div>
  </div>
)

type ItemsProp = Msg[] | Record<string, Msg> | null | undefined
function toArray(v: ItemsProp): Msg[] {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') return Object.values(v)
  return []
}

const MessageList: React.FC<{
  items: ItemsProp
  selfId: string
  typingNames?: string[]
  onLoadOlder?: () => void
  hasMoreOlder?: boolean
  loadingOlder?: boolean
  /** change cette valeur quand tu veux forcer un scroll-bas (ex: nouveau message) */
  autoScrollToken?: string | number
}> = ({
  items,
  selfId,
  typingNames = [],
  onLoadOlder,
  hasMoreOlder = false,
  loadingOlder = false,
  autoScrollToken,
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)

  const list = toArray(items)

  // Auto-scroll BAS uniquement quand le jeton change (nouveau message récent)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight + 1, behavior: 'smooth' })
  }, [autoScrollToken])

  // IO : quand on atteint le haut → charger plus
  useEffect(() => {
    if (!onLoadOlder) return
    const root = ref.current
    const target = topSentinelRef.current
    if (!root || !target) return

    let locked = false
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (e.isIntersecting && hasMoreOlder && !loadingOlder && !locked) {
          locked = true
          const before = root.scrollHeight
          Promise.resolve(onLoadOlder()).finally(() => {
            // préserve la position après prépend
            requestAnimationFrame(() => {
              const after = root.scrollHeight
              const delta = after - before
              root.scrollTop += delta
              locked = false
            })
          })
        }
      },
      { root, threshold: 0.01 }
    )

    obs.observe(target)
    return () => obs.disconnect()
  }, [onLoadOlder, hasMoreOlder, loadingOlder])

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-4 space-y-2">
      {/* Sentinelle + loader top */}
      <div ref={topSentinelRef} />
      {loadingOlder && (
        <div className="flex justify-center py-2">
          <div className="h-6 w-6 rounded-full border-2 border-[var(--border)] border-t-[var(--primary)] animate-spin" />
        </div>
      )}

      {list.map((m, idx) => {
        const mine = m.senderId === selfId
        const key = `${m.id ?? 'tmp'}-${m.createdAt ?? idx}`
        return (
          <div key={key} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm border ${
                mine
                  ? 'bg-gradient-to-tr from-[var(--primary-600)] to-[var(--primary)] text-white border-transparent'
                  : 'bg-[var(--bg-soft)] text-[var(--fg)] border-[var(--border)]'
              }`}
            >
              {/* media */}
              {m.image && !isVideoUrl(m.image) && (
                <img className="rounded-lg mb-2 max-h-72" src={m.image} loading="lazy" alt="attachment" />
              )}
              {m.image && isVideoUrl(m.image) && (
                <video className="rounded-lg mb-2 max-h-72 w-full" src={m.image} controls preload="metadata" />
              )}
              {m.audio && <audio className="w-full mb-2" controls src={m.audio} preload="metadata" />}

              {/* text */}
              {m.body && <div className="whitespace-pre-wrap">{m.body}</div>}

              <div className="text-[11px] opacity-70 mt-1">
                {new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        )
      })}

      {typingNames.length > 0 && <TypingBubble names={typingNames} />}
    </div>
  )
}

export default MessageList
