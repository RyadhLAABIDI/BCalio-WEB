// src/pages/Login.tsx
import React, { useState } from 'react'
import { login } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import QRLogin from '../components/QRLogin'

const Login: React.FC = () => {
  const { setSession } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('alice@example.com')
  const [password, setPassword] = useState('alicepass')
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'password' | 'qr'>('password')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      const res = await login(email, password)
      setSession(res.token, res.user)
      nav('/chat')
    } catch (e: any) {
      setErr(e.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center relative">
      <div className="card w-[420px] max-w-[95vw]">
        <div className="text-xl font-semibold mb-4 title">Login</div>

        {/* Sélecteur de mode */}
        <div className="flex gap-2 mb-4">
          <button
            className={`px-3 py-2 rounded transition-colors ${
              mode === 'password' ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
            }`}
            onClick={() => setMode('password')}
            type="button"
          >
            Email & mot de passe
          </button>
          <button
            className={`px-3 py-2 rounded transition-colors ${
              mode === 'qr' ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
            }`}
            onClick={() => setMode('qr')}
            type="button"
          >
            Se connecter avec le téléphone (QR)
          </button>
        </div>

        {mode === 'password' ? (
          <>
            <form onSubmit={submit} className="space-y-3">
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                className="input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              {err && <div className="text-red-400 text-sm">{err}</div>}
              <button className="btn-primary w-full" type="submit" disabled={loading}>
                {loading ? 'Connexion…' : 'Login'}
              </button>
            </form>

            <div className="mt-3 text-sm opacity-80">
              No account?{' '}
              <Link className="underline" to="/register">
                Register
              </Link>
            </div>
          </>
        ) : (
          <QRLogin
            onSuccess={({ token, user }) => {
              // ⬇️ IMPORTANT : on sauvegarde la session puis on redirige
              setSession(token, user)
              nav('/chat')
            }}
          />
        )}
      </div>
    </div>
  )
}

export default Login
