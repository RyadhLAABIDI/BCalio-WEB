import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'

/* ─────────────────────────── Types ─────────────────────────── */
export type Presence = { userId: string; online: boolean; lastSeen: number | null }
export type TypingState = { [conversationId: string]: Set<string> }

type SocketCtx = {
  socket: Socket | null
  presence: Record<string, Presence>
  typing: TypingState
  setTyping: React.Dispatch<React.SetStateAction<TypingState>>
  requestPresence: (userIds: string[]) => void
  emitTyping: (toUserId: string, conversationId: string) => void
  stopTyping: (toUserId: string, conversationId: string) => void
}

const defaultCtx: SocketCtx = {
  socket: null,
  presence: {},
  typing: {},
  setTyping: () => {},
  requestPresence: () => {},
  emitTyping: () => {},
  stopTyping: () => {},
}

const SocketContext = createContext<SocketCtx>(defaultCtx)
export const useSocket = () => useContext(SocketContext)

/* ───────────────────────── Provider ───────────────────────── */
export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()

  const [socket, setSocket] = useState<Socket | null>(null)
  const [presence, setPresence] = useState<Record<string, Presence>>({})
  const [typing, setTyping] = useState<TypingState>({})

  // refs persistants pour timers & socket courant
  const sockRef = useRef<Socket | null>(null)

  // TTL auto-clear pour "typing" reçu (remote → moi)
  // convId -> (userId -> timeoutId)
  const typingTTLsRef = useRef<Map<string, Map<string, ReturnType<typeof setTimeout>>>>(new Map())
  // timers côté client pour envoyer automatiquement "stop-typing" après un délai (moi → remote)
  const sendStopTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // URL du serveur Socket.IO
  const socketUrl = (import.meta.env.VITE_SOCKET_URL as string) || 'https://backendcall.b-callio.com'

  useEffect(() => {
    // Si pas d'utilisateur: couper la socket existante proprement
    if (!user) {
      try {
        sockRef.current?.removeAllListeners()
        sockRef.current?.disconnect()
      } catch {}
      sockRef.current = null
      setSocket(null)
      setPresence({})
      setTyping({})
      // Clear tous les timers
      for (const [, perConv] of typingTTLsRef.current) {
        for (const [, tId] of perConv) clearTimeout(tId)
      }
      typingTTLsRef.current.clear()
      for (const [, tId] of sendStopTimersRef.current) clearTimeout(tId)
      sendStopTimersRef.current.clear()
      return
    }

    // Création d’une nouvelle connexion (forceNew pour éviter réutilisation d’un ancien engine)
    const s = io(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
      withCredentials: true,
    })

    sockRef.current = s
    setSocket(s)

    /* ─────── Helpers d’attache détachables (pour cleanup propre) ─────── */
    const onConnect = () => {
      // Enregistre l’utilisateur dès la connexion
      const displayName = user.name || user.email || user.id
      s.emit('register', { userId: user.id, name: displayName })
    }

    const onPresenceUpdate = (p: Presence) => {
      setPresence(prev => ({ ...prev, [p.userId]: p }))
    }

    const onPresenceState = ({ list }: { list: Presence[] }) => {
      setPresence(prev => {
        const next = { ...prev }
        for (const p of list) next[p.userId] = p
        return next
      })
    }

    // Gestion TTL "typing…" distant
    const touchTypingTTL = (conversationId: string, fromUserId: string) => {
      if (!typingTTLsRef.current.has(conversationId)) {
        typingTTLsRef.current.set(conversationId, new Map())
      }
      const perConv = typingTTLsRef.current.get(conversationId)!
      const existing = perConv.get(fromUserId)
      if (existing) clearTimeout(existing)
      const t = setTimeout(() => {
        setTyping(prev => {
          const set = new Set(prev[conversationId] || [])
          set.delete(fromUserId)
          return { ...prev, [conversationId]: set }
        })
        perConv.delete(fromUserId)
      }, 1800) // efface auto après 1.8s si pas de refresh
      perConv.set(fromUserId, t)
    }

    const onTyping = ({ conversationId, fromUserId }: { conversationId: string; fromUserId: string }) => {
      if (!conversationId || !fromUserId) return
      setTyping(prev => {
        const set = new Set(prev[conversationId] || [])
        set.add(fromUserId)
        return { ...prev, [conversationId]: set }
      })
      touchTypingTTL(conversationId, fromUserId)
    }

    const onStopTyping = ({ conversationId, fromUserId }: { conversationId: string; fromUserId: string }) => {
      if (!conversationId || !fromUserId) return
      const perConv = typingTTLsRef.current.get(conversationId)
      if (perConv?.has(fromUserId)) {
        clearTimeout(perConv.get(fromUserId)!)
        perConv.delete(fromUserId)
      }
      setTyping(prev => {
        const set = new Set(prev[conversationId] || [])
        set.delete(fromUserId)
        return { ...prev, [conversationId]: set }
      })
    }

    const onConnectError = (e: any) => {
      // Optionnel: logger / afficher une bannière
      // console.warn('[Socket] connect_error:', e?.message || e)
    }

    const onDisconnect = () => {
      // Cleanup léger lors d’un disconnect (on garde state pour auto-reconnect)
      // console.log('[Socket] disconnected')
    }

    // Attache des listeners
    s.on('connect', onConnect)
    s.on('presence-update', onPresenceUpdate)
    s.on('presence-state', onPresenceState)
    s.on('typing', onTyping)
    s.on('stop-typing', onStopTyping)
    s.on('connect_error', onConnectError)
    s.on('disconnect', onDisconnect)

    // Cleanup quand user, url ou composant changent
    return () => {
      // Détacher précisément chaque listener (évite doublons)
      s.off('connect', onConnect)
      s.off('presence-update', onPresenceUpdate)
      s.off('presence-state', onPresenceState)
      s.off('typing', onTyping)
      s.off('stop-typing', onStopTyping)
      s.off('connect_error', onConnectError)
      s.off('disconnect', onDisconnect)

      // Fermer proprement la socket
      try {
        s.removeAllListeners()
        s.disconnect()
      } catch {}

      if (sockRef.current === s) {
        sockRef.current = null
      }

      // On ne réinitialise pas ici presence/typing pour permettre un re-render doux;
      // Si besoin de reset complet, on le fait quand user devient null (voir plus haut).
    }
    // ⚠️ Dépendances: changer si user ou URL changent
  }, [user?.id, user?.name, user?.email, socketUrl])

  /* ──────────────────────── API exposée au front ──────────────────────── */

  const requestPresence = (userIds: string[]) => {
    if (!sockRef.current) return
    if (!Array.isArray(userIds) || userIds.length === 0) return
    sockRef.current.emit('presence-request', { userIds })
  }

  // Envoi "typing" + auto "stop-typing" après délai (debounce)
  const emitTyping = (toUserId: string, conversationId: string) => {
    if (!sockRef.current || !toUserId || !conversationId) return
    sockRef.current.emit('typing', { to: toUserId, conversationId })

    // debounce de l’envoi “stop-typing”
    const prev = sendStopTimersRef.current.get(conversationId)
    if (prev) clearTimeout(prev)
    const t = setTimeout(() => {
      try {
        sockRef.current?.emit('stop-typing', { to: toUserId, conversationId })
      } finally {
        sendStopTimersRef.current.delete(conversationId)
      }
    }, 1200)
    sendStopTimersRef.current.set(conversationId, t)
  }

  const stopTyping = (toUserId: string, conversationId: string) => {
    if (!sockRef.current || !toUserId || !conversationId) return
    // Annule le timer local si on stoppe explicitement
    const prev = sendStopTimersRef.current.get(conversationId)
    if (prev) {
      clearTimeout(prev)
      sendStopTimersRef.current.delete(conversationId)
    }
    sockRef.current.emit('stop-typing', { to: toUserId, conversationId })
  }

  // Nettoyage lors de la fermeture d’onglet (optionnel mais utile)
  useEffect(() => {
    const handler = () => {
      try {
        sockRef.current?.disconnect()
      } catch {}
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const value = useMemo(
    () => ({ socket, presence, typing, setTyping, requestPresence, emitTyping, stopTyping }),
    [socket, presence, typing]
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}
