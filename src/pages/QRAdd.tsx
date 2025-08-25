import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { addByQrToken, createOneToOne } from '../utils/api'
import { useNavigate, useSearchParams } from 'react-router-dom'

const QRAdd: React.FC = () => {
  const { user, token } = useAuth()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [status, setStatus] = useState<'idle'|'ok'|'already'|'err'>('idle')
  const [contactId, setContactId] = useState<string>('')

  useEffect(() => {
    if (!user) return
    const raw = params.get('t') || '' // raw JWT from the QR link
    if (!raw) { setStatus('err'); return }
    ;(async () => {
      try {
        const res = await addByQrToken(user.id, raw)
        setContactId(res.contactId)
        setStatus(res.already ? 'already' : 'ok')
      } catch {
        setStatus('err')
      }
    })()
  }, [user?.id])

  const startChat = async () => {
    if (!token || !contactId) return nav('/')
    const conv = await createOneToOne(token, contactId)
    sessionStorage.setItem('openConvId', conv.id)
    nav('/')
  }

  return (
    <div className="h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-[var(--border)] rounded-xl p-6">
        <div className="title font-semibold mb-2">Add contact by QR</div>
        {status === 'idle' && <div>Checking…</div>}
        {status === 'ok' && (
          <>
            <div className="mb-3">Contact added successfully!</div>
            <button className="btn-primary" onClick={startChat}>Start chatting</button>
          </>
        )}
        {status === 'already' && (
          <>
            <div className="mb-3">You were already connected.</div>
            <button className="btn-primary" onClick={startChat}>Open chat</button>
          </>
        )}
        {status === 'err' && <div className="text-red-400">Invalid or expired QR.</div>}
      </div>
    </div>
  )
}

export default QRAdd
