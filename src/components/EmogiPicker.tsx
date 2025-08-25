// src/components/EmojiPicker.tsx
import React, { useEffect, useState } from 'react'

const EmojiPicker: React.FC<{ onSelect: (native: string) => void }> = ({ onSelect }) => {
  const [Picker, setPicker] = useState<any>(null)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    let alive = true
    Promise.all([import('@emoji-mart/react'), import('@emoji-mart/data')])
      .then(([mod, dt]) => {
        if (!alive) return
        setPicker(() => mod.default)
        setData(dt.default)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  if (!Picker || !data) return null

  return (
    <div className="absolute bottom-14 left-0 z-50 rounded-xl p-2 glass">
      <Picker
        data={data}
        theme={theme as any}
        previewPosition="none"
        onEmojiSelect={(e: any) => onSelect(e.native)}
      />
    </div>
  )
}
export default EmojiPicker
