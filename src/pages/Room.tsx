// src/pages/Room.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRoomSocket } from '../roomkit/useRoomSocket'
import { useWebRTC } from '../roomkit/useWebRTC'
import VideoTile from '../components/VideoTile'
import ChatPane, { ChatMsg } from '../components/ChatPane'

const Room: React.FC = () => {
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const { user, silentReconnectApp } = useAuth()
  const displayName =
    (user?.name && user.name.trim()) ||
    (user?.email ? user.email.split('@')[0] : '') ||
    'Guest'

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const myName = displayName
  const [pending, setPending] = useState<Array<{id:string;name:string}>>([])

  const socket = useRoomSocket({
    roomId,
    displayName,

    onExistingUsers: (users) => {
      users.forEach(u => wrtc.addPeer(u.id, u.name))
    },
    onPendingRequest: (id, name) => {
      setPending(prev => [...prev, { id, name }])
    },
    onUserConnected: (id, name) => wrtc.addPeer(id, name),
    onUserDisconnected: (id) => {
      wrtc.removePeer(id)
      setPending(prev => prev.filter(p => p.id !== id))
    },

    onChatHistory: (hist) => {
      const myId = socket.getSocketId()
      const mapped = hist.map((raw: any) => {
        const from = String(raw?.from ?? '')
        const name = String(raw?.name ?? '')
        return {
          id: String(raw?.id ?? ''),
          from, name,
          msg: String(raw?.msg ?? ''),
          ts: Number(raw?.ts ?? Date.now()),
          mine: (!!from && from === myId) || (!!name && name === myName),
        } as ChatMsg
      })
      setMessages(mapped)
    },

    onChat: (p) => {
      const from = String(p?.from ?? '')
      const name = String(p?.name ?? '')
      const m: ChatMsg = {
        id: String(p?.id ?? ''),
        from, name,
        msg: String(p?.msg ?? ''),
        ts: Number(p?.ts ?? Date.now()),
        mine: (!!from && from === socket.getSocketId()) || (!!name && name === myName),
      }
      setMessages(prev => [...prev, m])
    },

    onOffer:  (from, sdp) => wrtc.handleOffer(from, sdp),
    onAnswer: (from, sdp) => wrtc.handleAnswer(from, sdp),
    onIce:    (from, ice) => wrtc.handleIce(from, ice),

    onRejected: () => {
      navigate('/chat')
    },
  })

  const wrtc = useWebRTC({
    selfName: displayName,
    getSocketId: () => socket.getSocketId(),
    emitOffer:  (to, sdp) => socket.emitOffer(to, sdp),
    emitAnswer: (to, sdp) => socket.emitAnswer(to, sdp),
    emitIce:    (to, ice) => socket.emitIce(to, ice),
  })

  const sendChat = (text: string) => socket.sendMessage(text)
  const isOwner = useMemo(() => pending.length > 0, [pending.length])

  const approve = (id: string, allow: boolean) => {
    socket.approveUser(id, allow)
    setPending(prev => prev.filter(p => p.id !== id))
  }

  const quit = async () => {
    try { socket.leave() } catch {}
    try { wrtc.leave() } catch {}
    // (petit délai pour laisser tomber les connexions)
    await new Promise(r => setTimeout(r, 80))
    try { await silentReconnectApp() } catch {}
    navigate('/chat')
  }

  useEffect(() => {
    // cleanup global si on part autrement que par le bouton
    return () => {
      try { socket.leave() } catch {}
      try { wrtc.leave() } catch {}
      // pas d'attente/navigation ici
      silentReconnectApp().catch(()=>{})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-cyan-500/30 pb-2">
        <div className="text-lg font-semibold text-amber-400">Room {roomId}</div>
        {isOwner && <span className="text-yellow-400">★</span>}
        <div className="ml-auto flex gap-2">
          <button className={`px-3 py-1 rounded ${wrtc.micOn?'bg-green-600':'bg-red-600'}`} onClick={wrtc.toggleMic}>
            {wrtc.micOn ? 'Mic On' : 'Mic Off'}
          </button>
          <button className={`px-3 py-1 rounded ${wrtc.camOn?'bg-green-600':'bg-red-600'}`} onClick={wrtc.toggleCam}>
            {wrtc.camOn ? 'Cam On' : 'Cam Off'}
          </button>
          <button className="px-3 py-1 rounded bg-red-700 hover:bg-red-800" onClick={quit}>
            Quitter
          </button>
        </div>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="p-2 rounded border border-amber-500/40 bg-amber-900/20 text-amber-200">
          <div className="font-medium mb-1">Demandes de connexion</div>
          <div className="space-y-1">
            {pending.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <div className="flex-1">{p.name}</div>
                <button className="px-2 py-0.5 rounded bg-green-600 hover:bg-green-700" onClick={()=>approve(p.id, true)}>Accepter</button>
                <button className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700" onClick={()=>approve(p.id, false)}>Refuser</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="grid grid-cols-2 gap-2">
          {wrtc.participants.map(p =>
            <VideoTile key={p.id} id={p.id} name={p.name || (p.id==='self' ? displayName : '')} stream={p.stream} isSelf={p.id==='self'} />
          )}
        </div>

        <div className="h-80 md:h-full">
          <ChatPane
            myId={socket.getSocketId()}
            myName={myName}
            messages={messages}
            onSend={sendChat}
          />
        </div>
      </div>
    </div>
  )
}

export default Room
