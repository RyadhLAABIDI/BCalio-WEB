import React, { useRef, useState } from 'react'
import { useSocket } from '../../context/SocketContext'
import EmojiPicker from '../EmogiPicker'
import { uploadToCloudinary } from '../../utils/upload'
import VoiceRecorder from './VoiceRecorder'

const Composer: React.FC<{
  conversationId: string
  toUserId?: string
  onSend: (text: string, image?: string, audio?: string) => void
}> = ({ conversationId, toUserId, onSend }) => {
  const [text, setText] = useState('')
  const [show, setShow] = useState(false)
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { emitTyping, stopTyping } = useSocket()

  const pickEmoji = (e: string) => {
    setText(t => t + e)
    if (toUserId) emitTyping(toUserId, conversationId)
  }

  const attach = async (file: File) => {
    const url = await uploadToCloudinary(file)
    if (file.type.startsWith('image/')) onSend('', url, '')
    else if (file.type.startsWith('audio/')) onSend('', '', url)
    else onSend('[video]', url, '')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    await onSend(text)
    setText('')
    setSending(false)
    if (toUserId) stopTyping(toUserId, conversationId)
  }

  return (
    <form onSubmit={submit} className="p-3 flex items-center gap-2 border-t border-[var(--border)] relative">
      <button type="button" className="btn-ghost" onClick={() => setShow(s => !s)}>😊</button>
      {show && <EmojiPicker onSelect={pickEmoji} />}

      <input
        className="input flex-1"
        placeholder="Type a message"
        value={text}
        onChange={(e) => { setText(e.target.value); if (toUserId) emitTyping(toUserId, conversationId) }}
        onKeyDown={() => { if (toUserId) emitTyping(toUserId, conversationId) }}
        onBlur={() => { if (toUserId) stopTyping(toUserId, conversationId) }}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,audio/*,video/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) { try { await attach(f) } catch (err) { console.error(err) } }
          if (fileRef.current) fileRef.current.value = ''
        }}
      />
      <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>📎</button>

      <button type="button" className="btn-ghost" onClick={() => setRecording(true)}>🎙️</button>
      {recording && (
        <VoiceRecorder
          onCancel={() => setRecording(false)}
          onUploaded={(url) => { setRecording(false); onSend('', '', url) }}
        />
      )}

      <button className="btn-primary" disabled={sending}>Send</button>
    </form>
  )
}
export default Composer
