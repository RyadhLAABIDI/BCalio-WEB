import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type Participant = { id: string; name: string; stream?: MediaStream | null }

type Args = {
  selfName: string
  getSocketId: () => string
  emitOffer: (to: string, sdp: any) => void
  emitAnswer: (to: string, sdp: any) => void
  emitIce: (to: string, ice: any) => void
}

type PeerState = {
  pc: RTCPeerConnection
  initiator: boolean
  makingOffer: boolean
  polite: boolean
  haveRemote: boolean
  pendingIce: RTCIceCandidateInit[]
  answerWatchdog?: any
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
}
function preferCodec(sdp: string, kind: 'audio'|'video', codec: 'H264'|'VP8') {
  const sdpLines = sdp.split('\r\n')
  const mLineIndex = sdpLines.findIndex(l => l.startsWith(`m=${kind}`))
  if (mLineIndex === -1) return sdp

  const rtpmap: Record<string,string> = {}
  for (const l of sdpLines) {
    if (l.startsWith('a=rtpmap:')) {
      const m = l.match(/^a=rtpmap:(\d+)\s+([A-Za-z0-9\-]+)/)
      if (m) rtpmap[m[1]] = m[2].toUpperCase()
    }
  }
  const wantedPts = Object.keys(rtpmap).filter(pt => rtpmap[pt].includes(codec))
  if (wantedPts.length === 0) return sdp

  const parts = sdpLines[mLineIndex].split(' ')
  const header = parts.slice(0,3)
  const payloads = parts.slice(3)
  const newPayloads = [...wantedPts, ...payloads.filter(p => !wantedPts.includes(p))]
  sdpLines[mLineIndex] = [...header, ...newPayloads].join(' ')
  return sdpLines.join('\r\n')
}

export function useWebRTC({ selfName, getSocketId, emitOffer, emitAnswer, emitIce }: Args) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peers = useRef<Map<string, PeerState>>(new Map())

  const config = useMemo<RTCConfiguration>(() => {
    const FORCE_RELAY = false
    return {
      iceServers: [
        { urls: ['stun:fr-turn3.xirsys.com', 'stun:stun.l.google.com:19302'] },
        {
          urls: [
            'turn:fr-turn3.xirsys.com:80?transport=udp',
            'turn:fr-turn3.xirsys.com:3478?transport=udp',
            'turn:fr-turn3.xirsys.com:80?transport=tcp',
            'turn:fr-turn3.xirsys.com:3478?transport=tcp',
            'turns:fr-turn3.xirsys.com:443?transport=tcp',
            'turns:fr-turn3.xirsys.com:5349?transport=tcp',
          ],
          username: 'oOk-ca-e8130Y5GOX_DTijaY3lpYLXkH8ecECdK_e_VBpGN6eQ9cJaansd7UkQ3DAAAAAGiuNflCQ2FsaW8=',
          credential: '8aa96840-82cc-11f0-97ad-e25abca605ee',
        },
      ],
      bundlePolicy: 'max-bundle',
      iceTransportPolicy: (FORCE_RELAY ? 'relay' : 'all'),
      iceCandidatePoolSize: 4,
    } as RTCConfiguration
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: { facingMode: 'user' }
        })
        localStreamRef.current = s
        setParticipants(prev => {
          const ex = prev.find(p => p.id === 'self')
          if (ex) return prev.map(p => p.id==='self' ? ({...p, name:selfName, stream:s}) : p)
          return [{ id: 'self', name: selfName, stream: s }]
        })
      } catch (e) {
        console.warn('getUserMedia error:', e)
      }
    })()
    return () => { /* leave() explicite */ }
  }, [selfName])

  const leave = useCallback(() => {
    try {
      const s = localStreamRef.current
      s?.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    } catch {}
    try { peers.current.forEach(p => { try { p.pc.close() } catch {} }) } catch {}
    peers.current.clear()
    setParticipants(prev => prev.filter(p => p.id === 'self').map(p => ({...p, stream:null})))
  }, [])

  const addPeer = useCallback(async (remoteId: string, remoteName: string) => {
    if (remoteId === getSocketId()) return
    if (peers.current.has(remoteId)) return

    const myId = getSocketId() || ''
    const initiator = myId ? (myId.localeCompare(remoteId) < 0) : (selfName.localeCompare(remoteName) < 0)
    const polite    = myId ? (myId.localeCompare(remoteId) > 0) : (selfName.localeCompare(remoteName) > 0)

    const pc = new RTCPeerConnection(config)
    const state: PeerState = {
      pc, initiator, makingOffer: false, polite, haveRemote: false, pendingIce: [],
    }
    peers.current.set(remoteId, state)

    const s = localStreamRef.current
    if (s) s.getTracks().forEach(t => { try { pc.addTrack(t, s) } catch{} })

    pc.ontrack = (evt) => {
      const stream = evt.streams?.[0] || null
      if (!stream) return
      setParticipants(prev => {
        const ex = prev.find(p => p.id === remoteId)
        if (ex) return prev.map(p => p.id === remoteId ? { ...p, name: remoteName, stream } : p)
        return [...prev, { id: remoteId, name: remoteName, stream }]
      })
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) emitIce(remoteId, {
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
      })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        try { pc.restartIce() } catch {}
      }
    }

    pc.onnegotiationneeded = async () => {
      if (!state.initiator) return
      if (pc.signalingState !== 'stable' || state.makingOffer) return
      await makeOffer(remoteId, state)
    }

    if (initiator && pc.signalingState === 'stable') {
      await makeOffer(remoteId, state)
    }
  }, [config, emitIce, emitOffer, getSocketId, selfName]) // eslint-disable-line

  const removePeer = useCallback((id: string) => {
    const st = peers.current.get(id)
    if (st) {
      clearTimeout(st.answerWatchdog)
      st.pc.close()
      peers.current.delete(id)
    }
    setParticipants(prev => prev.filter(p => p.id !== id))
  }, [])

  async function makeOffer(remoteId: string, ps: PeerState, retry=false) {
    if (ps.pc.signalingState !== 'stable') return
    try {
      ps.makingOffer = true
      let offer = await ps.pc.createOffer({})
      const want = isIOS() ? 'H264' as const : 'VP8' as const
      offer.sdp = preferCodec(offer.sdp || '', 'video', want)
      await ps.pc.setLocalDescription(offer)
      const desc = ps.pc.localDescription
      if (desc) emitOffer(remoteId, { type: desc.type, sdp: desc.sdp })
      clearTimeout(ps.answerWatchdog)
      ps.answerWatchdog = setTimeout(() => {
        if (ps.pc.signalingState === 'have-local-offer' && !retry) {
          makeOffer(remoteId, ps, true)
        }
      }, 6000)
    } finally {
      ps.makingOffer = false
    }
  }

  const handleOffer = useCallback(async (from: string, sdp: any) => {
    let ps = peers.current.get(from)
    if (!ps) {
      const pc = new RTCPeerConnection(config)
      ps = { pc, initiator: false, makingOffer: false, polite: true, haveRemote: false, pendingIce: [] }
      peers.current.set(from, ps)

      const s = localStreamRef.current
      if (s) s.getTracks().forEach(t => { try { pc.addTrack(t, s) } catch {} })

      pc.ontrack = (evt) => {
        const stream = evt.streams?.[0] || null
        if (!stream) return
        setParticipants(prev => {
          const ex = prev.find(p => p.id === from)
          if (ex) return prev.map(p => p.id === from ? { ...p, stream } : p)
          return [...prev, { id: from, name: '', stream }]
        })
      }
      pc.onicecandidate = (e) => {
        if (e.candidate) emitIce(from, {
          candidate: e.candidate.candidate,
          sdpMid: e.candidate.sdpMid,
          sdpMLineIndex: e.candidate.sdpMLineIndex,
        })
      }
    }
    const pc = ps.pc

    const stable = pc.signalingState === 'stable'
    const glare  = ps.makingOffer || !stable
    if (glare && !ps.polite) return

    if (!stable) {
      try { await pc.setLocalDescription({ type: 'rollback' } as any) } catch {}
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    ps.haveRemote = true

    for (const ice of ps.pendingIce.splice(0)) {
      try { await pc.addIceCandidate(ice) } catch {}
    }

    let answer = await pc.createAnswer({})
    const want = isIOS() ? 'H264' as const : 'VP8' as const
    answer.sdp = preferCodec(answer.sdp || '', 'video', want)
    await pc.setLocalDescription(answer)
    const desc = pc.localDescription
    if (desc) emitAnswer(from, { type: desc.type, sdp: desc.sdp })
  }, [config, emitAnswer, emitIce])

  const handleAnswer = useCallback(async (from: string, sdp: any) => {
    const ps = peers.current.get(from)
    if (!ps) return
    clearTimeout(ps.answerWatchdog)
    await ps.pc.setRemoteDescription(new RTCSessionDescription(sdp))
    ps.haveRemote = true
    for (const ice of ps.pendingIce.splice(0)) {
      try { await ps.pc.addIceCandidate(ice) } catch {}
    }
  }, [])

  const handleIce = useCallback(async (from: string, ice: any) => {
    const ps = peers.current.get(from)
    if (!ps) return
    const cand: RTCIceCandidateInit = {
      candidate: ice?.candidate ?? '',
      sdpMid: ice?.sdpMid,
      sdpMLineIndex: ice?.sdpMLineIndex,
    }
    if (ps.haveRemote) {
      try { await ps.pc.addIceCandidate(cand) } catch {}
    } else {
      ps.pendingIce.push(cand)
    }
  }, [])

  const toggleMic = useCallback(() => {
    setMicOn(v => {
      const s = localStreamRef.current
      s?.getAudioTracks().forEach(t => t.enabled = !v)
      return !v
    })
  }, [])
  const toggleCam = useCallback(() => {
    setCamOn(v => {
      const s = localStreamRef.current
      s?.getVideoTracks().forEach(t => t.enabled = !v)
      return !v
    })
  }, [])

  return {
    participants,
    micOn, camOn,
    toggleMic, toggleCam,
    localStream: localStreamRef.current,
    addPeer, removePeer,
    handleOffer, handleAnswer, handleIce,
    leave,
  }
}
