import React, { useEffect, useMemo, useRef, useState } from 'react'
import ConversationList from '../components/Chat/ConversationList'
import MessageList from '../components/Chat/MessageList'
import Composer from '../components/Chat/Composer'
import { myConversations, getMessages, sendMessage, getUsers, createOneToOne, createGroup, markSeen } from '../utils/api'
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

const Chat: React.FC = () => {
  const { user, token, logout } = useAuth()
  const { socket, typing, presence, requestPresence } = useSocket()

  const [conversations, setConversations] = useState<any[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [incoming, setIncoming] = useState<any | null>(null)
  const [activeCall, setActiveCall] = useState<ActiveCall>(null)
  const [creating, setCreating] = useState(false)

  const pollRef = useRef<number | undefined>(undefined)
  // remember what the caller chose (audio/video) because server events may not include callType
  const lastDialTypeRef = useRef<'audio' | 'video'>('audio')

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

  const loadMessages = async (cid: string) => {
    if (!token) return
    const ms = await getMessages(token, cid)
    setMessages(ms)
    await markSeen(token, cid)
  }

  useEffect(() => {
    if (!token || !currentId) return
    loadMessages(currentId).catch(console.error)
    if (pollRef.current) window.clearInterval(pollRef.current)
    pollRef.current = window.setInterval(() => loadMessages(currentId).catch(() => {}), 2500)
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

    // caller view (server may omit callType)
    const openCaller = ({ callId, callType }: any) => {
      if (!otherUser) return
      const t: 'audio' | 'video' = (callType || lastDialTypeRef.current || 'audio')
      setActiveCall(prev =>
        prev?.id === callId
          ? prev
          : { id: callId, type: t, role: 'caller', peerId: otherUser.id }
      )
    }

    const onIncoming = (data: any) => {
      // data: { callId, callerId, callerName, callType, isGroup }
      setIncoming(data)
    }

    const onAccepted = (payload: any) => openCaller(payload)     // payload might be {callId}
    const onInitiated = (payload: any) => openCaller(payload)    // payload might be {callId}
    const onEnd = () => setActiveCall(null)
    const onCancelled = () => setActiveCall(null)
    const onTimeout = () => setActiveCall(null)

    const onMessage = ({ conversationId, preview }: any) => {
      if (conversationId === currentId) loadMessages(conversationId).catch(() => {})
      else if ('Notification' in window && Notification.permission === 'granted') {
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
    setMessages(m => [...m, msg])
    await markSeen(token, currentId)
    if (socket && otherUser) {
      socket.emit('notify-message', {
        toUserId: otherUser.id,
        conversationId: currentId,
        preview: text
      })
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
    socket.emit('initiate-call', {
      callerId: user.id,
      recipientId: otherUser.id,
      name: user.name,
      callType: type
    })
    // server will emit 'call-initiated' (sometimes without type) → we use lastDialTypeRef
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

        {/* pass presence so the list can show green dots */}
        <ConversationList
          items={conversations}
          currentId={currentId}
          onSelect={setCurrentId}
          presence={presence}
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
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  presence[otherUser.id]?.online ? 'bg-green-400' : 'bg-gray-500'
                }`}
              />
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

        <MessageList items={messages} selfId={user?.id || ''} typingNames={typingNames} />
        {currentConv && (
          <Composer
            conversationId={currentConv.id}
            toUserId={otherUser?.id}
            onSend={onSend}
          />
        )}
      </div>

      {/* Caller opens panel from call-initiated/accepted; callee opens panel after Accept */}
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
          // payload might be {callId, callType, peerId? , callerId?}
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
