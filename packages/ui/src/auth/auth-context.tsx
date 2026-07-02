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

export type QueryUser = {
  virtualserverId?: string | number
  [key: string]: unknown
}

type SaveConnectionParams = {
  serverId?: string | number
  queryUser?: QueryUser
  token?: string
}

type AuthContextValue = {
  token: string | undefined
  serverId: string | undefined
  queryUser: QueryUser
  connected: boolean
  loggedOut: boolean
  rememberLogin: boolean
  saveToken: (token: string) => void
  removeToken: () => void
  saveServerId: (serverId: string | number) => void
  removeServerId: () => void
  saveQueryUser: (queryUser: QueryUser) => void
  saveConnection: (connection: SaveConnectionParams) => void
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
  const [serverId, setServerId] = useState<string | undefined>(() =>
    Cookies.get("serverId"),
  )
  const [queryUser, setQueryUser] = useState<QueryUser>({})
  const [connected, setConnected] = useState(false)
  const [loggedOut, setLoggedOut] = useState(true)
  const [rememberLogin, setRememberLogin] = useState(true)

  const cookieOptions = useMemo(
    () => ({ expires: rememberLogin ? 365 : undefined }),
    [rememberLogin],
  )

  const saveToken = useCallback(
    (nextToken: string) => {
      Cookies.set("token", nextToken, cookieOptions)
      setToken(nextToken)
    },
    [cookieOptions],
  )

  const removeToken = useCallback(() => {
    Cookies.remove("token")
    setToken(undefined)
  }, [])

  const saveServerId = useCallback(
    (nextServerId: string | number) => {
      const normalizedServerId = String(nextServerId)

      Cookies.set("serverId", normalizedServerId, cookieOptions)
      setServerId(normalizedServerId)
    },
    [cookieOptions],
  )

  const removeServerId = useCallback(() => {
    Cookies.remove("serverId")
    setServerId(undefined)
  }, [])

  const saveQueryUser = useCallback((nextQueryUser: QueryUser) => {
    setQueryUser(nextQueryUser)
  }, [])

  const saveConnection = useCallback(
    ({ serverId: nextServerId, queryUser: nextQueryUser, token: nextToken }: SaveConnectionParams) => {
      setConnected(true)

      if (nextServerId !== undefined) {
        saveServerId(nextServerId)
      }

      if (nextQueryUser) {
        saveQueryUser(nextQueryUser)
      }

      if (nextToken) {
        saveToken(nextToken)
      }
    },
    [saveQueryUser, saveServerId, saveToken],
  )

  const clearSession = useCallback(() => {
    setConnected(false)
    setLoggedOut(true)
    setQueryUser({})
    removeServerId()
    removeToken()
  }, [removeServerId, removeToken])

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
      serverId,
      queryUser,
      connected,
      loggedOut,
      rememberLogin,
      saveToken,
      removeToken,
      saveServerId,
      removeServerId,
      saveQueryUser,
      saveConnection,
      clearSession,
      setConnected,
      setLoggedOut,
      setRememberLogin,
    }),
    [
      token,
      serverId,
      queryUser,
      connected,
      loggedOut,
      rememberLogin,
      saveToken,
      removeToken,
      saveServerId,
      removeServerId,
      saveQueryUser,
      saveConnection,
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
