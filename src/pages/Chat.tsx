import React, { useEffect, useMemo, useRef, useState } from 'react'
import ConversationList from '../components/Chat/ConversationList'
import MessageList from '../components/Chat/MessageList'
import Composer from '../components/Chat/Composer'
import { myConversations, getMessages, getMessagesPage, sendMessage, getUsers, createOneToOne, createGroup, markSeen } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import CallPopup from '../components/CallPopup'
import CallPanel from '../components/CallPanel'
import { Link } from 'react-router-dom'

type ActiveCall = {
  id: string
  type: 'audio' | 'video'
  role: 'caller' | 'callee'
  peerId: string
} | null

const PAGE_SIZE = 15

const Chat: React.FC = () => {
  const { user, token, logout } = useAuth()
  const { socket, typing, presence, requestPresence } = useSocket()

  const [conversations, setConversations] = useState<any[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)

  const [messages, setMessages] = useState<any[]>([])
  const [meta, setMeta] = useState<null | { hasMoreBefore: boolean; nextBeforeId: string | null; hasMoreAfter: boolean; nextAfterId: string | null; count: number }>(null)
  const [loadingInitial, setLoadingInitial] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const [incoming, setIncoming] = useState<any | null>(null)
  const [activeCall, setActiveCall] = useState<ActiveCall>(null)
  const [creating, setCreating] = useState(false)

  const pollRef = useRef<number | undefined>(undefined)
  const lastDialTypeRef = useRef<'audio' | 'video'>('audio')

  const [autoScrollToken, setAutoScrollToken] = useState<string>('init') // change quand on veut forcer scroll-bas

  const currentConv = useMemo(
    () => conversations.find(c => c.id === currentId) || null,
    [conversations, currentId]
  )

  const otherUser = useMemo(() => {
    if (!currentConv) return null
    return (currentConv.users || []).find((u: any) => u && u.id !== user?.id) || null
  }, [currentConv?.id, user?.id])

  useEffect(() => {
    if ('Notification' in window) Notification.requestPermission().catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) return
    myConversations(token)
      .then(list => {
        setConversations(list)
        if (!currentId && list[0]) setCurrentId(list[0].id)
      })
      .catch(console.error)
  }, [token])

  // ------- Chargement initial de 15 messages avec meta -------
  const loadInitial = async (cid: string) => {
    if (!token) return
    setLoadingInitial(true)
    try {
      const page = await getMessagesPage(token, cid, { take: PAGE_SIZE, includeSender: true, includeSeen: false })
      const sorted = [...page.data].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
      setMessages(sorted)
      setMeta({
        count: page.meta.count,
        hasMoreBefore: page.meta.hasMoreBefore ?? Boolean(sorted.length >= PAGE_SIZE),
        hasMoreAfter: page.meta.hasMoreAfter ?? false,
        nextBeforeId: page.meta.nextBeforeId ?? (sorted.length ? String(sorted[0].id) : null),
        nextAfterId: page.meta.nextAfterId ?? (sorted.length ? String(sorted[sorted.length - 1].id) : null),
      })
      setAutoScrollToken(`init:${cid}:${Date.now()}`) // scroll-bas après init
      await markSeen(token, cid)
    } finally {
      setLoadingInitial(false)
    }
  }

  // ------- Charger plus ancien (top) -------
  const loadOlder = async () => {
    if (!token || !currentId) return
    if (!meta?.hasMoreBefore || !meta?.nextBeforeId) return
    if (loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await getMessagesPage(token, currentId, {
        take: PAGE_SIZE,
        beforeId: meta.nextBeforeId,
        includeSender: true,
        includeSeen: false,
      })
      const older = [...page.data].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())

      // dédup par id + concat (older puis existants), tri asc
      setMessages(prev => {
        const map = new Map<string, any>()
        for (const m of older) map.set(String(m.id ?? ''), m)
        for (const m of prev) map.set(String(m.id ?? ''), m)
        return Array.from(map.values()).sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
      })

      setMeta(m => ({
        count: page.meta.count,
        hasMoreBefore: page.meta.hasMoreBefore ?? (older.length >= PAGE_SIZE),
        hasMoreAfter: m?.hasMoreAfter ?? false,
        nextBeforeId: page.meta.nextBeforeId ?? (older.length ? String(older[0].id) : m?.nextBeforeId ?? null),
        nextAfterId: m?.nextAfterId ?? null,
      }))
      // ⚠️ pas de changement d’autoScrollToken ici → on ne force pas le scroll-bas
    } finally {
      setLoadingOlder(false)
    }
  }

  // --------- boucle de polling pour nouveaux messages (bas) ---------
  useEffect(() => {
    if (!token || !currentId) return
    // 1er chargement
    loadInitial(currentId).catch(console.error)

    // polling périodique
    if (pollRef.current) window.clearInterval(pollRef.current)
    pollRef.current = window.setInterval(async () => {
      try {
        // on utilise l'ancien getMessages pour récupérer rapidement la page courante (par exemple take=PAGE_SIZE, afterId=meta.nextAfterId)
        // ici, choix simple: on recharge juste la dernière page (take=PAGE_SIZE) sans afterId, et on merge par id
        const ms = await getMessages(token, currentId, { take: PAGE_SIZE, includeSender: true, includeSeen: false })
        if (!ms?.length) return
        setMessages(prev => {
          const map = new Map<string, any>()
          for (const m of prev) map.set(String(m.id ?? ''), m)
          for (const m of ms) map.set(String(m.id ?? ''), m)
          const merged = Array.from(map.values()).sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
          return merged
        })
        setAutoScrollToken(`tick:${currentId}:${ms[ms.length - 1]?.id ?? Date.now()}`)
      } catch {}
    }, 2500)

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [token, currentId])

  // ask for presence for current conversation members
  useEffect(() => {
    const ids = (currentConv?.users || []).map((u: any) => u.id)
    if (ids.length) requestPresence(ids)
  }, [currentConv?.id])

  useEffect(() => {
    if (!socket) return

    const openCaller = ({ callId, callType }: any) => {
      if (!otherUser) return
      const t: 'audio' | 'video' = (callType || lastDialTypeRef.current || 'audio')
      setActiveCall(prev => prev?.id === callId ? prev : { id: callId, type: t, role: 'caller', peerId: otherUser.id })
    }

    const onIncoming = (data: any) => setIncoming(data)
    const onAccepted = (payload: any) => openCaller(payload)
    const onInitiated = (payload: any) => openCaller(payload)
    const onEnd = () => setActiveCall(null)
    const onCancelled = () => setActiveCall(null)
    const onTimeout = () => setActiveCall(null)

    const onMessage = ({ conversationId, preview }: any) => {
      if (conversationId === currentId) {
        // on force un reload “bas” via autoScrollToken
        setAutoScrollToken(`push:${conversationId}:${Date.now()}`)
        loadInitial(conversationId).catch(() => {})
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New message', { body: preview || 'New message' })
      }
    }

    socket.on('incoming-call', onIncoming)
    socket.on('call-accepted', onAccepted)
    socket.on('call-initiated', onInitiated)
    socket.on('call-ended', onEnd)
    socket.on('call-cancelled', onCancelled)
    socket.on('call-timeout', onTimeout)
    socket.on('message', onMessage)

    return () => {
      socket.off('incoming-call', onIncoming)
      socket.off('call-accepted', onAccepted)
      socket.off('call-initiated', onInitiated)
      socket.off('call-ended', onEnd)
      socket.off('call-cancelled', onCancelled)
      socket.off('call-timeout', onTimeout)
      socket.off('message', onMessage)
    }
  }, [socket, currentId, otherUser?.id])

  const typingNames = useMemo(() => {
    const set = typing[currentId || ''] || new Set()
    const others = (currentConv?.users || []).filter((u: any) => set.has(u.id))
    return others.map((u: any) => u.name)
  }, [typing, currentId, currentConv?.id])

  const onSend = async (text: string, image?: string, audio?: string) => {
    if (!token || !currentId) return
    const msg = await sendMessage(token, currentId, text, image, audio)
    setMessages(m => {
      const next = [...m, msg]
      return next.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
    })
    setAutoScrollToken(`send:${currentId}:${msg?.id ?? Date.now()}`) // scroll-bas car on vient d’envoyer
    await markSeen(token, currentId)
    if (socket && otherUser) {
      socket.emit('notify-message', { toUserId: otherUser.id, conversationId: currentId, preview: text })
    }
  }

  const startDirect = async () => {
    if (!token) return
    const users = await getUsers(token)
    const target = users.find((u: any) => u.id !== user?.id)
    if (!target) return
    const conv = await createOneToOne(token, target.id)
    setConversations(c => [conv, ...c])
    setCurrentId(conv.id)
  }

  const call = (type: 'audio' | 'video') => {
    if (!socket || !user || !otherUser) return
    lastDialTypeRef.current = type
    socket.emit('initiate-call', { callerId: user.id, recipientId: otherUser.id, name: user.name, callType: type })
  }

  const createGroupUi = async () => {
    setCreating(true)
    try {
      if (!token) return
      const users = await getUsers(token)
      const memberIds = users.filter((u: any) => u.id !== user?.id).map((u: any) => u.id)
      const conv = await createGroup(token, 'My Group', '', memberIds)
      setConversations(c => [conv, ...c])
      setCurrentId(conv.id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-screen flex">
      {/* LEFT: conversations */}
      <div className="w-[320px] border-r border-[var(--border)] flex flex-col">
        <div className="p-3 flex items-center gap-2">
          <img src="/logo.png" className="w-9 h-9 rounded-lg" />
          <div className="font-semibold flex-1 title">B-Callio</div>
          <Link to="/contacts" className="btn-ghost">👥</Link>
          <Link to="/qr" className="btn-ghost">QR</Link>
          <button onClick={startDirect} className="btn-ghost">➕</button>
          <button onClick={logout} className="btn-ghost">⎋</button>
        </div>
        <button className="btn-primary mx-3 mb-2" onClick={createGroupUi} disabled={creating}>
          {creating ? '…' : 'New Group'}
        </button>

        <ConversationList
  items={conversations}
  currentId={currentId}
  onSelect={setCurrentId}
  presence={presence}
  myId={user?.id}        // 👈 pour masquer ton nom dans les 1–1
/>
      </div>

      {/* RIGHT: messages */}
      <div className="flex-1 flex flex-col">
        <div className="p-3 border-b border-[var(--border)] flex items-center gap-3">
          <div className="font-medium title">
            {currentConv?.isGroup ? currentConv.name : otherUser?.name}
          </div>

          {otherUser && (
            <div className="flex items-center gap-2 text-xs opacity-80">
              <span className={`w-2.5 h-2.5 rounded-full ${presence[otherUser.id]?.online ? 'bg-green-400' : 'bg-gray-500'}`} />
              <span>
                {presence[otherUser.id]?.online
                  ? 'online'
                  : presence[otherUser.id]?.lastSeen
                  ? new Date(presence[otherUser.id]!.lastSeen!).toLocaleTimeString()
                  : 'offline'}
              </span>
            </div>
          )}

          <div className="ml-auto flex gap-2">
            <button className="btn-ghost" onClick={() => call('audio')}>📞</button>
            <button className="btn-ghost" onClick={() => call('video')}>📹</button>
          </div>
        </div>

        <MessageList
          items={messages}
          selfId={user?.id || ''}
          typingNames={[]}
          onLoadOlder={loadOlder}
          hasMoreOlder={!!meta?.hasMoreBefore}
          loadingOlder={loadingOlder || loadingInitial}
          autoScrollToken={autoScrollToken}
        />

        {currentConv && (
          <Composer conversationId={currentConv.id} toUserId={otherUser?.id} onSend={onSend} />
        )}
      </div>

      {activeCall && (
        <CallPanel
          callId={activeCall.id}
          callType={activeCall.type}
          role={activeCall.role}
          peerId={activeCall.peerId}
          onClose={() => setActiveCall(null)}
        />
      )}

      <CallPopup
        data={incoming}
        onClose={() => setIncoming(null)}
        onAccept={(payload: any) => {
          const pid = payload?.peerId ?? payload?.callerId
          const ctype: 'audio' | 'video' = payload?.callType || 'audio'
          if (!pid) return setIncoming(null)
          setActiveCall({ id: payload.callId, type: ctype, role: 'callee', peerId: pid })
          setIncoming(null)
        }}
      />
    </div>
  )
}

export default Chat
