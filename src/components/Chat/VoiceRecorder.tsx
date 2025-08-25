import React, { useEffect, useRef, useState } from 'react'
import { uploadToCloudinary } from '../../utils/upload'

const pickMime = () => {
  const MR: any = (window as any).MediaRecorder
  if (MR?.isTypeSupported?.('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MR?.isTypeSupported?.('audio/webm')) return 'audio/webm'
  if (MR?.isTypeSupported?.('audio/mp4')) return 'audio/mp4'
  return 'audio/webm'
}
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000); const mm = String(Math.floor(s / 60)).padStart(2,'0'); const ss = String(s%60).padStart(2,'0'); return `${mm}:${ss}`
}

const VoiceRecorder: React.FC<{ onCancel: () => void; onUploaded: (audioUrl: string) => void }> = ({ onCancel, onUploaded }) => {
  const [paused, setPaused] = useState(false)
  const [time, setTime] = useState(0)
  const [err, setErr] = useState('')

  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mimeRef = useRef<string>('audio/webm')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const mime = pickMime(); mimeRef.current = mime
        const rec = new MediaRecorder(stream, { mimeType: mime }); recRef.current = rec
        chunksRef.current = []
        rec.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data) }
        rec.onstop = async () => {
          try {
            const blob = new Blob(chunksRef.current, { type: mime })
            const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type })
            const url = await uploadToCloudinary(file)
            onUploaded(url)
          } catch (e: any) {
            setErr(e?.message || 'upload_failed')
          } finally {
            stream.getTracks().forEach(t => t.stop())
          }
        }
        rec.start(100)
        timerRef.current = window.setInterval(() => setTime(t => t + 200), 200)
      } catch (e: any) {
        setErr(e?.message || 'mic_denied')
      }
    })()
    return () => {
      mounted = false
      if (timerRef.current) clearInterval(timerRef.current)
      try { recRef.current && recRef.current.state !== 'inactive' && recRef.current.stop() } catch {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    }
  }, [])

  const stopAll = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    try { recRef.current && recRef.current.state !== 'inactive' && recRef.current.stop() } catch {}
  }
  const pause = () => {
    if (!recRef.current) return
    if (recRef.current.state === 'recording') {
      recRef.current.pause(); setPaused(true)
      if (timerRef.current) clearInterval(timerRef.current)
    } else if (recRef.current.state === 'paused') {
      recRef.current.resume(); setPaused(false)
      timerRef.current = window.setInterval(() => setTime(t => t + 200), 200)
    }
  }

  return (
    <div className="absolute -top-16 left-0 right-0 mx-auto w-max rounded-full bg-[var(--panel)]/90 backdrop-blur px-4 py-2 shadow-lg flex items-center gap-3">
      <span className="text-sm">{paused ? 'Paused' : 'Recording'}</span>
      <span className="text-sm opacity-80">{fmt(time)}</span>
      <button onClick={pause} className="btn-ghost">{paused ? '▶ Resume' : '⏸ Pause'}</button>
      <button onClick={stopAll} className="btn-primary">Send</button>
      <button onClick={() => { onCancel(); try { recRef.current?.stop() } catch {} }} className="btn-ghost">✖</button>
      {err && <span className="text-xs text-red-400">{err}</span>}
    </div>
  )
}
export default VoiceRecorder
