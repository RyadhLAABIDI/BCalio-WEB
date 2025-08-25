import React, { useEffect, useRef, useState } from 'react'
import { useSocket } from '../context/SocketContext'

type Props = {
  callId: string
  callType: 'audio' | 'video'
  role: 'caller' | 'callee'
  peerId: string              // userId du pair (le serveur mappe vers le socket)
  onClose: () => void
}

/**
 * Changements clés vs ta version précédente:
 * - Attente de 'call-accepted' avant d'envoyer la première OFFER si role === 'caller'
 * - SDP envoyés aplanis: { type, sdp } (évite les edge-cases de sérialisation)
 * - Perfect-negotiation conservé (glare), mais négociation initiale pilotée par l’acceptation
 * - Autoplay explicite sur <audio>/<video>, cleanup tracks & pc
 */
const CallPanel: React.FC<Props> = ({ callId, callType, role, peerId, onClose }) => {
  const { socket } = useSocket()

  const localVideo  = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const remoteAudio = useRef<HTMLAudioElement>(null)

  const pcRef     = useRef<RTCPeerConnection|null>(null)
  const streamRef = useRef<MediaStream|null>(null)

  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(callType === 'video')
  const [err, setErr]     = useState<string>('')

  const [state, setState] = useState<{ice:string, conn:string, sig:string}>({
    ice: 'new', conn: 'new', sig: 'stable'
  })

  // Perfect-negotiation helpers
  const makingOfferRef = useRef(false)
  const ignoreOfferRef = useRef(false)
  const srdAnswerPendingRef = useRef(false)
  const acceptedRef = useRef(role === 'callee') // callee peut accepter côté UI immédiatement
  const POLITE = role === 'callee'

  const safe = () => !!pcRef.current && pcRef.current.signalingState !== 'closed'

  const getIceServers = () => {
    const url = import.meta.env.VITE_TURN_URL as string | undefined
    const username = import.meta.env.VITE_TURN_USERNAME as string | undefined
    const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined
    const base = [{ urls: 'stun:stun.l.google.com:19302' } as RTCIceServer]
    if (url && username && credential) base.push({ urls: url, username, credential })
    return base
  }

  useEffect(() => {
    if (!socket) return

    const pc = new RTCPeerConnection({ iceServers: getIceServers() })
    pcRef.current = pc

    // Diagnostics
    pc.oniceconnectionstatechange = () => setState(s => ({...s, ice: pc.iceConnectionState}))
    pc.onconnectionstatechange    = () => setState(s => ({...s, conn: pc.connectionState}))
    pc.onsignalingstatechange     = () => setState(s => ({...s, sig: pc.signalingState}))

    // Tracks in
    pc.ontrack = async (e) => {
      const stream = e.streams[0]
      if (remoteAudio.current) {
        try { remoteAudio.current.srcObject = stream; await remoteAudio.current.play().catch(()=>{}) } catch {}
      }
      if (callType === 'video' && remoteVideo.current) {
        try { remoteVideo.current.srcObject = stream; await remoteVideo.current.play().catch(()=>{}) } catch {}
      }
    }

    // ICE out
    pc.onicecandidate = (e) => {
      if (!e.candidate || !safe()) return
      const c = e.candidate
      socket.emit('ice', { to: peerId, ice: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } })
    }

    const ensureLocal = async () => {
      if (streamRef.current) return streamRef.current
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video' ? { facingMode: 'user' } : false
      })
      streamRef.current = media

      for (const t of media.getTracks()) { try { pc.addTrack(t, media) } catch {} }

      if (localVideo.current && callType === 'video') {
        localVideo.current.srcObject = media
        localVideo.current.muted = true
        try { await localVideo.current.play().catch(()=>{}) } catch {}
      }
      return media
    }

    const makeOffer = async () => {
      if (!safe()) return
      if (!acceptedRef.current && role === 'caller') {
        // Tant que l’appel n’est pas accepté, on n’émet pas d’offer (évite have-local-offer qui bloque)
        return
      }
      try {
        makingOfferRef.current = true
        await ensureLocal()
        if (!safe() || pc.signalingState !== 'stable') return
        const offer = await pc.createOffer()
        if (!safe()) return
        await pc.setLocalDescription(offer)
        if (!safe()) return
        // SDP aplani (compat)
        socket.emit('offer', { to: peerId, sdp: { type: offer.type, sdp: offer.sdp } })
      } catch (e:any) {
        console.warn('[CallPanel] makeOffer error:', e?.message || e)
      } finally {
        makingOfferRef.current = false
      }
    }

    // On ne lance PLUS d’offer automatiquement sur negotiationneeded tant que pas accepté
    pc.onnegotiationneeded = async () => {
      if (role !== 'caller') return
      if (!acceptedRef.current) return
      if (pc.signalingState !== 'stable') return
      await makeOffer()
    }

    // --- Socket handlers (perfect negotiation + “wait accepted”) ---
    const onCallAccepted = () => {
      // Le serveur émet 'call-accepted' dans la room → le caller peut maintenant envoyer l’offer
      acceptedRef.current = true
      if (role === 'caller') {
        // petite attente pour être sûr que le callee a monté son PC
        setTimeout(() => makeOffer(), 50)
      }
    }

    const onOffer = async ({ from, sdp }: any) => {
      if (from !== peerId || !safe()) return
      const pcNow = pcRef.current!
      const desc = sdp && typeof sdp.type === 'string' ? sdp : { type: sdp?.type, sdp: sdp?.sdp }

      const offerCollision = (desc.type === 'offer') &&
        (makingOfferRef.current || pcNow.signalingState !== 'stable')

      ignoreOfferRef.current = !POLITE && offerCollision
      if (ignoreOfferRef.current) {
        console.log('[CallPanel] Ignoring glare offer')
        return
      }

      try {
        srdAnswerPendingRef.current = desc.type === 'answer'
        await pcNow.setRemoteDescription(new RTCSessionDescription(desc))
        srdAnswerPendingRef.current = false

        if (desc.type === 'offer') {
          await ensureLocal()
          const answer = await pcNow.createAnswer()
          await pcNow.setLocalDescription(answer)
          socket.emit('answer', { to: peerId, sdp: { type: answer.type, sdp: answer.sdp } })
        }
      } catch (e:any) {
        console.warn('[CallPanel] onOffer/onAnswer error:', e?.message || e)
      }
    }

    const onAnswer = async ({ from, sdp }: any) => {
      if (from !== peerId || !safe()) return
      const desc = sdp && typeof sdp.type === 'string' ? sdp : { type: sdp?.type, sdp: sdp?.sdp }
      try {
        await pcRef.current!.setRemoteDescription(new RTCSessionDescription(desc))
      } catch (e:any) {
        console.warn('[CallPanel] setRemoteDescription(answer) error:', e?.message || e)
      }
    }

    const onIce = async ({ from, ice }: any) => {
      if (from !== peerId || !safe()) return
      try { await pcRef.current!.addIceCandidate(new RTCIceCandidate(ice)) } catch {}
    }

    const onCallCancelled = () => { onClose() }
    const onCallEnded     = () => { onClose() }
    const onCallRejected  = () => { onClose() }
    const onCallTimeout   = () => { onClose() }

    // Attache listeners
    socket.on('call-accepted', onCallAccepted)
    socket.on('offer',  onOffer)
    socket.on('answer', onAnswer)
    socket.on('ice',    onIce)
    socket.on('call-cancelled', onCallCancelled)
    socket.on('call-ended',     onCallEnded)
    socket.on('call-rejected',  onCallRejected)
    socket.on('call-timeout',   onCallTimeout)

    // Prépare local (mais n’émet pas d’offer tant que pas accepté si caller)
    const start = async () => {
      try { await ensureLocal() } catch (e:any) { setErr(e?.message || 'media_error') }
      // Si callee, il attend OFFER (rien à faire ici)
      // Si caller et que l’appel est déjà accepté (rare) → go
      if (role === 'caller' && acceptedRef.current) setTimeout(() => makeOffer(), 50)
    }
    start()

    return () => {
      socket.off('call-accepted', onCallAccepted)
      socket.off('offer',  onOffer)
      socket.off('answer', onAnswer)
      socket.off('ice',    onIce)
      socket.off('call-cancelled', onCallCancelled)
      socket.off('call-ended',     onCallEnded)
      socket.off('call-rejected',  onCallRejected)
      socket.off('call-timeout',   onCallTimeout)

      try {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        const pcNow = pcRef.current
        if (pcNow) {
          pcNow.getSenders().forEach(s => s.track && s.track.stop())
          pcNow.getReceivers().forEach(r => r.track && r.track.stop())
          pcNow.close()
        }
      } catch {}
      pcRef.current = null
    }
  }, [socket?.id, role, peerId, callType, callId])

  const end = () => { socket?.emit('end-call', { callId }); onClose() }

  const toggleMic = () => {
    const s = streamRef.current
    s?.getAudioTracks().forEach(t => t.enabled = !t.enabled)
    setMicOn(s?.getAudioTracks()[0]?.enabled ?? false)
  }

  const toggleCam = () => {
    if (callType !== 'video') return
    const s = streamRef.current
    s?.getVideoTracks().forEach(t => t.enabled = !t.enabled)
    setCamOn(s?.getVideoTracks()[0]?.enabled ?? false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center">
      <div className="card w-[900px] max-w-[95vw] h-[560px] flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <div className="font-semibold title">In call • {callType==='video'?'Video':'Audio'}</div>
          <div className="text-xs opacity-70 ml-2">ice:{state.ice} • conn:{state.conn} • sig:{state.sig}</div>
          <div className="ml-auto flex gap-2">
            <button onClick={toggleMic} className="btn-ghost">{micOn?'🎙️ Mute':'🔇 Unmute'}</button>
            {callType==='video' && <button onClick={toggleCam} className="btn-ghost">{camOn?'📷 Off':'📷 On'}</button>}
            <button className="btn-ghost text-red-300 border-red-400" onClick={end}>⛔ End</button>
          </div>
        </div>

        {callType === 'video' ? (
          <div className="flex-1 grid grid-cols-2 gap-3">
            <video ref={remoteVideo} className="glass rounded-xl w-full h-full object-cover" autoPlay playsInline />
            <video ref={localVideo}  className="glass rounded-xl w-full h-full object-cover" autoPlay muted playsInline />
            <audio ref={remoteAudio} autoPlay />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="glass rounded-xl w-full h-full flex items-center justify-center text-sm opacity-80">
              Remote audio stream…
            </div>
            <div className="glass rounded-xl w-full h-full flex items-center justify-center text-sm opacity-80">
              Your microphone…
            </div>
            <audio ref={remoteAudio} autoPlay />
          </div>
        )}

        {err && <div className="text-red-300 text-sm mt-2">{err}</div>}
      </div>
    </div>
  )
}

export default CallPanel
