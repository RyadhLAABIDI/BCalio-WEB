import React, { useEffect, useState } from 'react'
import './styles.css'
import './i18n'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Chat from './pages/Chat'
import Contacts from './pages/Contacts'
import QRMy from './pages/QRMy'
import QRScan from './pages/QRScan'
import ThreeBackground from './components/ThreeBackground'
import LanguageSwitcher from './components/LanguageSwitcher'
import { useAuth } from './context/AuthContext'
import QRAdd from './pages/QRAdd'

const Protected: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth()
  if (!user || !token) return <Navigate to="/login" replace />
  return <>{children}</>
}

const App: React.FC = () => {
  const [dark, setDark] = useState(()=> localStorage.getItem('theme')==='dark')
  useEffect(()=>{ const html=document.documentElement; if(dark) html.classList.add('dark'); else html.classList.remove('dark'); localStorage.setItem('theme', dark?'dark':'light') },[dark])

  return (
    <div className="min-h-screen relative">
      <ThreeBackground />
      <div className="p-3 flex items-center gap-2">
        <img src="/logo.png" className="w-9 h-9 rounded-lg" />
        <div className="font-semibold flex-1 title">B-Callio</div>
        <LanguageSwitcher />
        <button className="btn-ghost" onClick={()=>setDark(d=>!d)}>{dark?'☀️':'🌙'}</button>
      </div>
      <Routes>
        <Route path="/login" element={<Login/>} />
        <Route path="/register" element={<Register/>} />
        <Route path="/chat" element={<Protected><Chat/></Protected>} />
        <Route path="/contacts" element={<Protected><Contacts/></Protected>} />
        <Route path="/qr" element={<Protected><QRMy/></Protected>} />
        <Route path="/qr-scan" element={<Protected><QRScan/></Protected>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
        <Route path="/qr/add" element={<Protected><QRAdd/></Protected>} />

      </Routes>
    </div>
  )
}
export default App
