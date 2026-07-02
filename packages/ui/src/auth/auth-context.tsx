import Cookies from "js-cookie"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "react-router-dom"

import { socket } from "@/api/socket"

type AuthContextValue = {
  token: string | undefined
  connected: boolean
  loggedOut: boolean
  rememberLogin: boolean
  saveToken: (token: string) => void
  removeToken: () => void
  clearSession: () => void
  setConnected: (connected: boolean) => void
  setLoggedOut: (loggedOut: boolean) => void
  setRememberLogin: (rememberLogin: boolean) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | undefined>(() => Cookies.get("token"))
  const [connected, setConnected] = useState(false)
  const [loggedOut, setLoggedOut] = useState(true)
  const [rememberLogin, setRememberLogin] = useState(true)

  const saveToken = useCallback(
    (nextToken: string) => {
      Cookies.set("token", nextToken, {
        expires: rememberLogin ? 365 : undefined,
      })
      setToken(nextToken)
    },
    [rememberLogin],
  )

  const removeToken = useCallback(() => {
    Cookies.remove("token")
    setToken(undefined)
  }, [])

  const clearSession = useCallback(() => {
    setConnected(false)
    setLoggedOut(true)
    removeToken()
  }, [removeToken])

  useEffect(() => {
    const redirectToLogin = () => {
      setConnected(false)
      navigate("/login", { replace: true })
    }

    const handleTeamSpeakDisconnect = () => {
      clearSession()
      navigate("/login", { replace: true })
    }

    socket.on("connect_error", redirectToLogin)
    socket.on("disconnect", redirectToLogin)
    socket.on("teamspeak-disconnect", handleTeamSpeakDisconnect)

    return () => {
      socket.off("connect_error", redirectToLogin)
      socket.off("disconnect", redirectToLogin)
      socket.off("teamspeak-disconnect", handleTeamSpeakDisconnect)
    }
  }, [clearSession, navigate])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      connected,
      loggedOut,
      rememberLogin,
      saveToken,
      removeToken,
      clearSession,
      setConnected,
      setLoggedOut,
      setRememberLogin,
    }),
    [
      token,
      connected,
      loggedOut,
      rememberLogin,
      saveToken,
      removeToken,
      clearSession,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}
