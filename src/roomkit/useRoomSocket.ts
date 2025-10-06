// src/roomkit/useRoomSocket.ts
import { useCallback, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

type User = { id: string; name: string }

type Args = {
  roomId: string
  displayName: string

  onExistingUsers?: (users: User[]) => void
  onPendingRequest?: (id: string, name: string) => void
  onUserConnected?: (id: string, name: string) => void
  onUserDisconnected?: (id: string) => void

  onChatHistory?: (hist: any[]) => void
  onChat?: (p: any) => void

  onOffer?: (from: string, sdp: any) => void
  onAnswer?: (from: string, sdp: any) => void
  onIce?: (from: string, ice: any) => void

  onRejected?: () => void
}

const BASE =
  (import.meta.env.VITE_CALL_BASE as string | undefined) ||
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
  'https://backendcall.b-callio.com'

// Namespace Room
const ROOM_NS = `${BASE.replace(/\/+$/, '')}/room`

function ts() { return new Date().toISOString().substring(11, 23) }
function log(m: string) { console.log(`[${ts()}][ROOMSOCK] ${m}`) }

export function useRoomSocket(args: Args) {
  const {
    roomId, displayName,
    onExistingUsers, onPendingRequest,
    onUserConnected, onUserDisconnected,
    onChatHistory, onChat,
    onOffer, onAnswer, onIce,
    onRejected,
  } = args

  const sockRef = useRef<Socket | null>(null)
  const idRef   = useRef<string>('')

  const hardClose = useCallback(() => {
    const s = sockRef.current
    if (!s) return
    try { s.offAny() } catch {}
    try { s.disconnect() } catch {}
    try { s.close() } catch {}
    // @ts-ignore (ancienne prop socket.io)
    try { s.removeAllListeners && s.removeAllListeners() } catch {}
    sockRef.current = null
    idRef.current = ''
    log('hardClose → socket nulled')
  }, [])

  const leave = useCallback(() => {
    const s = sockRef.current
    try {
      if (s) {
        log(`→ leave roomId=${roomId}`)
        s.emit('leave', { roomId })
      }
    } catch {}
    hardClose()
  }, [hardClose, roomId])

  const getSocketId = useCallback(() => idRef.current, [])

  const emitOffer  = useCallback((to: string, sdp: any) => sockRef.current?.emit('offer',  { to, sdp }), [])
  const emitAnswer = useCallback((to: string, sdp: any) => sockRef.current?.emit('answer', { to, sdp }), [])
  const emitIce    = useCallback((to: string, ice: any) => sockRef.current?.emit('ice',    { to, ice }), [])

  const approveUser = useCallback((id: string, allow: boolean) => {
    sockRef.current?.emit('approve-user', { roomId, id, allow })
  }, [roomId])

  const sendMessage = useCallback((msg: string) => {
    if (!msg.trim()) return
    sockRef.current?.emit('chat', { roomId, msg: msg.trim() })
  }, [roomId])

  // Connexion
  useEffect(() => {
    // Assainir avant de (re)connecter
    hardClose()

    log(`connect → ${ROOM_NS}`)
    const s = io(ROOM_NS, {
      transports: ['websocket'],
      reconnection: true,
      autoConnect: true,
    })
    sockRef.current = s

    s.on('connect', () => {
      idRef.current = s.id ?? ''
      log(`✔ connected id=${idRef.current}`)
      log(`→ join-room ${roomId} "${displayName}"`)
      s.emit('join-room', { roomId, name: displayName })
    })

    s.on('disconnect', (r) => log(`✖ disconnected (${r})`))
    s.on('connect_error', (e) => log(`ERR connect_error: ${e?.message || e}`))
    s.on('reconnect', (n) => log(`reconnected #${n}`))

    s.on('approved', () => {
      log('← approved → enter-room (guest)')
      s.emit('enter-room', { roomId, name: displayName })
    })

    s.on('existing-users', (list: any[]) => {
      log(`← existing-users count=${list?.length ?? 0}`)
      if (Array.isArray(list) && list.length === 0) {
        log('I am first → enter-room (owner)')
        s.emit('enter-room', { roomId, name: displayName })
      }
      onExistingUsers?.(list.map(u => ({ id: String(u.id), name: String(u.name) })))
    })

    s.on('pending-request', (d: any) => onPendingRequest?.(String(d?.id || ''), String(d?.name || '')))
    s.on('user-connected', (d: any)   => onUserConnected?.(String(d?.id || ''), String(d?.name || '')))
    s.on('user-disconnected', (id: string) => onUserDisconnected?.(String(id || '')))
    s.on('chat-history', (h: any[])   => onChatHistory?.(Array.isArray(h) ? h : []))
    s.on('chat', (p: any)             => onChat?.(p))

    s.on('offer',  (d: any) => onOffer?.(String(d?.from || ''),  d?.sdp))
    s.on('answer', (d: any) => onAnswer?.(String(d?.from || ''), d?.sdp))
    s.on('ice',    (d: any) => onIce?.(String(d?.from || ''),    d?.ice))

    s.on('rejected', () => {
      log('← rejected')
      onRejected?.()
    })

    return () => {
      // cleanup (navigation, onglet fermé)
      leave()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, displayName]) // re-crée le socket si roomId/nom change

  return {
    getSocketId,
    emitOffer, emitAnswer, emitIce,
    approveUser,
    sendMessage,
    leave,
  }
}
