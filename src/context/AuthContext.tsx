import React, { createContext, useContext, useState, useCallback } from 'react'
import { login, getStoredCreds } from '../utils/api'

type User = { id:string, email:string, name:string }
type Ctx = {
  user: User | null
  token: string | null
  setSession: (t:string, u:User) => void
  logout: () => void
  /** 🔄 Reconnexion silencieuse globale de l'app (HTTP + session) */
  silentReconnectApp: () => Promise<void>
}

const AuthContext = createContext<Ctx>({
  user: null,
  token: null,
  setSession: () => {},
  logout: () => {},
  silentReconnectApp: async () => {}
})

export const AuthProvider: React.FC<{children:React.ReactNode}> = ({ children }) => {
  const [user, setUser] = useState<User|null>(() => {
    try { return JSON.parse(localStorage.getItem('user')||'null') } catch { return null }
  })
  const [token, setToken] = useState<string|null>(() => localStorage.getItem('token'))

  const setSession = useCallback((t:string, u:User) => {
    setToken(t)
    setUser(u)
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.clear()
  }, [])

  /** 🔄 Reconnexion silencieuse :
   *  - relit email/password dans localStorage
   *  - refait /login
   *  - réécrit token + user dans le contexte
   *  (⚠️ ne touche pas aux sockets de room ici → on le fait dans la page Room)
   */
  const silentReconnectApp = useCallback(async () => {
    try {
      const { email, password } = getStoredCreds()
      if (!email || !password) {
        // Rien à faire si on n’a pas les creds
        return
      }
      const data = await login(email, password)  // { token, user }
      // data.user doit contenir {id, email, name}
      setSession(String(data.token || ''), {
        id: String(data.user?.id || ''),
        email: String(data.user?.email || email),
        name: String(data.user?.name || ''),
      })
      // (option) garder d’autres champs si ton backend renvoie plus de données
      // localStorage.setItem('image', data.user?.image || '')
      // localStorage.setItem('phoneNumber', data.user?.phoneNumber || '')
    } catch (e) {
      // silencieux
      console.debug('[Auth] silentReconnectApp error:', e)
    }
  }, [setSession])

  return (
    <AuthContext.Provider value={{ user, token, setSession, logout, silentReconnectApp }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
