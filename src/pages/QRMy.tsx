import React, { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../context/AuthContext'
import { getMyQrToken } from '../utils/api'

const QRMy: React.FC = () => {
  const { user } = useAuth()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrText, setQrText] = useState('')  // bcakio:qr-add:...
  const [link, setLink] = useState('')      // https fallback (works from camera)
  const [exp, setExp] = useState<number>(0)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { token, text, expSeconds } = await getMyQrToken(user.id)
      setQrText(text)
      setExp(expSeconds)

      // Fallback URL that phones can open from native camera:
      // /qr/add?t=<JWT> on your own site → we’ll build that page next
      const url = `${window.location.origin}/qr/add?t=${encodeURIComponent(token)}`
      setLink(url)

      // Render QR of the fallback URL (so any camera opens your site directly)
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, url, { width: 260, margin: 1 })
      }
    })().catch(console.error)
  }, [user?.id])

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text) } catch {}
  }

  const downloadPng = () => {
    const c = canvasRef.current
    if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = 'my-qr.png'
    a.click()
  }

  const share = async () => {
    if ((navigator as any).share) {
      try { await (navigator as any).share({ title: 'B-Callio QR', text: 'Scan to add me on B-Callio', url: link }) } catch {}
    } else {
      copy(link)
      alert('Link copied!')
    }
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 p-4">
      <div className="title font-semibold">My QR</div>

      <canvas ref={canvasRef} className="rounded-xl shadow-xl bg-white p-2" />

      <div className="text-xs opacity-80">
        Valid for ~{Math.floor(exp/86400)} days • Fallback link below
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="text-sm">Open on this device:</div>
        <div className="flex items-center gap-2">
          <input className="input flex-1" value={link} readOnly />
          <button className="btn-ghost" onClick={() => copy(link)}>Copy</button>
          <a className="btn-primary" href={link}>Open</a>
        </div>

        <div className="text-xs opacity-70">Raw token (app deep link):</div>
        <div className="flex items-center gap-2">
          <input className="input flex-1" value={qrText} readOnly />
          <button className="btn-ghost" onClick={() => copy(qrText)}>Copy</button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn-ghost" onClick={downloadPng}>Download PNG</button>
        <button className="btn-primary" onClick={share}>Share</button>
      </div>
    </div>
  )
}

export default QRMy
