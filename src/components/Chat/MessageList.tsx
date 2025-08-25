import React, { useEffect, useRef } from 'react'

type Msg = {
  id?: string
  senderId: string
  body?: string
  image?: string   // may also contain a video URL
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

const MessageList: React.FC<{ items: Msg[]; selfId: string; typingNames?: string[] }> = ({
  items,
  selfId,
  typingNames = [],
}) => {
  const ref = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight + 1, behavior: 'smooth' })
  }

  useEffect(() => { scrollToBottom() }, [items.length])
  useEffect(() => { if (typingNames.length) scrollToBottom() }, [typingNames.join('|')])

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-4 space-y-2">
      {items.map((m, idx) => {
        const mine = m.senderId === selfId
        return (
          <div key={`${m.id ?? 'tmp'}-${m.createdAt ?? idx}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm border ${
                mine
                  ? 'bg-gradient-to-tr from-[var(--primary-600)] to-[var(--primary)] text-white border-transparent'
                  : 'bg-[var(--bg-soft)] text-[var(--fg)] border-[var(--border)]'
              }`}
            >
              {/* media */}
              {m.image && !isVideoUrl(m.image) && (
                <img
                  className="rounded-lg mb-2 max-h-72"
                  src={m.image}
                  loading="lazy"
                  alt="attachment"
                />
              )}

              {m.image && isVideoUrl(m.image) && (
                <video
                  className="rounded-lg mb-2 max-h-72 w-full"
                  src={m.image}
                  controls
                  preload="metadata"
                />
              )}

              {m.audio && (
                <audio className="w-full mb-2" controls src={m.audio} preload="metadata" />
              )}

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
