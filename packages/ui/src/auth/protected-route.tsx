import { Navigate, Outlet } from "react-router-dom"

import { useAuth } from "@/auth/auth-context"

export function ProtectedRoute() {
  const { connected } = useAuth()

  if (connected !== true) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
