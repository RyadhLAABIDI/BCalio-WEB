import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const QRScan: React.FC = () => {
  const { user } = useAuth()
  const [token,setToken]=useState(''); const [res,setRes]=useState<any>(null)

  const add = async ()=>{
    if (!user) return
    const r = await fetch('/api/contacts/add-by-qr', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-user-id': user.id }, body: JSON.stringify({ token }) })
    const data = await r.json(); setRes(data)
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="card">
        <div className="mb-2">Paste QR text</div>
        <input className="input mb-2" value={token} onChange={e=>setToken(e.target.value)} />
        <button className="btn-primary" onClick={add}>Add contact</button>
        {res && <pre className="mt-3 text-xs whitespace-pre-wrap">{JSON.stringify(res,null,2)}</pre>}
      </div>
    </div>
  )
}
export default QRScan
