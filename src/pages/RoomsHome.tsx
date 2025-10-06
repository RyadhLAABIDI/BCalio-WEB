// src/pages/RoomsHome.tsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../roomkit/config'
import { useAuth } from '../context/AuthContext'

const RoomsHome: React.FC = () => {
  const nav = useNavigate()
  const { user } = useAuth()
  const [roomId, setRoomId] = useState('')
  const [displayName, setDisplayName] = useState(
    user?.name || (user as any)?.displayName || 'Guest'
  )
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const createRoom = async () => {
    setErr(null)
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/random-id`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      const id = String(j.id || '').trim()
      if (!id) throw new Error('Invalid id')
      nav(`/room/${id}`)
    } catch (e: any) {
      setErr(e.message || 'Create failed')
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = () => {
    setErr(null)
    const id = roomId.trim()
    if (!id) { setErr('Room id manquant'); return }
    if (!displayName.trim()) { setErr('Nom affiché manquant'); return }
    nav(`/room/${id}`)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-xl font-semibold text-amber-400">Rooms</div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-cyan-500/30 bg-black/30 space-y-3">
          <div className="font-medium text-cyan-300">Créer une room</div>
          <button
            className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60"
            disabled={loading}
            onClick={createRoom}
          >
            {loading ? 'Création…' : 'Créer'}
          </button>
        </div>

        <div className="p-4 rounded-lg border border-cyan-500/30 bg-black/30 space-y-3">
          <div className="font-medium text-cyan-300">Rejoindre une room</div>
          <input
            className="w-full px-3 py-2 rounded bg-black/50 border border-cyan-500/30 text-cyan-200"
            placeholder="Room ID"
            value={roomId}
            onChange={e=>setRoomId(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 rounded bg-black/50 border border-cyan-500/30 text-cyan-200"
            placeholder="Votre nom"
            value={displayName}
            onChange={e=>setDisplayName(e.target.value)}
          />
          <button
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-700"
            onClick={joinRoom}
          >
            Rejoindre
          </button>
        </div>
      </div>

      {err && <div className="text-red-400 text-sm">{err}</div>}

      <div className="text-xs text-cyan-400/70">
        Astuce : partage simplement l’URL <code>/room/&lt;id&gt;</code> pour inviter quelqu’un.
      </div>
    </div>
  )
}

export default RoomsHome
