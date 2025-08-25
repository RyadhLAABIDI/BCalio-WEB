import React, { createContext, useContext, useState } from 'react'
type User = { id:string, email:string, name:string }
type Ctx = { user:User|null, token:string|null, setSession:(t:string,u:User)=>void, logout:()=>void }
const AuthContext = createContext<Ctx>({ user:null, token:null, setSession:()=>{}, logout:()=>{} })

export const AuthProvider: React.FC<{children:React.ReactNode}> = ({ children }) => {
  const [user,setUser] = useState<User|null>(() => {
    try { return JSON.parse(localStorage.getItem('user')||'null') } catch { return null }
  })
  const [token,setToken] = useState<string|null>(() => localStorage.getItem('token'))

  const setSession = (t:string,u:User) => { setToken(t); setUser(u); localStorage.setItem('token',t); localStorage.setItem('user',JSON.stringify(u)) }
  const logout = () => { setUser(null); setToken(null); localStorage.clear() }

  return <AuthContext.Provider value={{ user, token, setSession, logout }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
