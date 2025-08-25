import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { registerPhone, login } from '../utils/api'
import { useAuth } from '../context/AuthContext'

const Register: React.FC = () => {
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [phone,setPhone]=useState('')
  const [password,setPassword]=useState('')
  const [err,setErr]=useState('')
  const nav = useNavigate()
  const { setSession } = useAuth()

  const submit = async (e:React.FormEvent)=>{
    e.preventDefault(); setErr('')
    try {
      await registerPhone(phone,email,name,password)
      const auth = await login(email,password); setSession(auth.token,auth.user); nav('/chat')
    } catch (e:any){ setErr(e.message||'Register failed') }
  }

  return (
    <div className="min-h-screen grid place-items-center relative">
      <div className="card w-[460px] max-w-[95vw]">
        <div className="text-xl font-semibold mb-4 title">Register</div>
        <form onSubmit={submit} className="space-y-3">
          <input className="input" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} required />
          <input className="input" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input className="input" placeholder="Phone number" value={phone} onChange={e=>setPhone(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required />
          {err && <div className="text-red-400 text-sm">{err}</div>}
          <button className="btn-primary w-full" type="submit">Register</button>
        </form>
        <div className="mt-3 text-sm opacity-80">Have an account? <Link className="underline" to="/login">Login</Link></div>
      </div>
    </div>
  )
}
export default Register
