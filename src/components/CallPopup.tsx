import React, { useEffect, useRef } from 'react'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'

const CallPopup: React.FC<{
  data: any|null,
  onClose: ()=>void,
  onAccept: (args:{callId:string, callType:'audio'|'video', peerId:string})=>void
}> = ({ data, onClose, onAccept }) => {
  const { socket } = useSocket()
  const { user } = useAuth()
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!data || !audioRef.current) return
    audioRef.current.loop = true
    audioRef.current.play().catch(()=>{})
    return () => { try { audioRef.current?.pause() } catch {} }
  }, [data?.callId])

  if (!data) return null

  const accept = async () => {
    if (!socket || !user) return
    socket.emit('accept-call', { callId: data.callId, userId: user.id })
    // role is implicitly 'callee' for this side
    try { await audioRef.current?.pause() } catch {}
    onAccept({ callId: data.callId, callType: data.callType, peerId: data.callerId })
    onClose()
  }
  const decline = () => {
    if (!socket || !user) return
    socket.emit('reject-call', { callId: data.callId, userId: user.id })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <audio ref={audioRef} src="/ringtone.wav" />
      <div className="card w-[420px] max-w-[92vw]">
        <div className="text-lg font-semibold mb-2">Incoming call</div>
        <div className="opacity-80 mb-4">{data.callerName} • {data.callType}</div>
        <div className="flex gap-3 justify-end">
          <button onClick={decline} className="btn-ghost border-red-400 text-red-300">⛔ Decline</button>
          <button onClick={accept} className="btn-primary">✅ Accept</button>
        </div>
      </div>
    </div>
  )
}
export default CallPopup
