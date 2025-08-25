import React from 'react'
// add prop
type Props = {
  items: any[]
  currentId: string | null
  onSelect: (id: string) => void
  presence?: Record<string, { online: boolean; lastSeen: number | null }>
}
const ConversationList: React.FC<Props> = ({ items, currentId, onSelect, presence = {} }) => {
  return (
    <div className="flex-1 overflow-y-auto">
      {items.map((c) => {
        const other = (c.users || []).find((u:any) => u && u.id !== c.selfId) || (c.users || [])[0]
        const p = other ? presence[other.id] : undefined
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-3 py-2 hover:bg-white/5 ${currentId===c.id ? 'bg-white/10' : ''}`}
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden" />
                {other && (
                  <span
                    className={`absolute -bottom-0 -right-0 w-3 h-3 rounded-full ring-2 ring-[var(--panel)]
                      ${p?.online ? 'bg-green-400' : 'bg-gray-500'}`}
                  />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">{c.isGroup ? c.name : other?.name}</div>
                <div className="text-xs opacity-70 truncate">{c.lastPreview || '—'}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
export default ConversationList
