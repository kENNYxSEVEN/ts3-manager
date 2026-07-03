import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import NProgress from "nprogress"

NProgress.configure({
  showSpinner: false,
  minimum: 0.15,
  trickleSpeed: 180,
})

export function RouteProgress() {
  const location = useLocation()

  useEffect(() => {
    NProgress.start()
    NProgress.set(0.35)

    const timerId = window.setTimeout(() => {
      NProgress.done()
    }, 1200)

    return () => {
      window.clearTimeout(timerId)
      NProgress.done()
    }
  }, [location.pathname, location.search])

  return null
}