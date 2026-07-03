import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, X } from "lucide-react"

type ErrorToast = {
  id: number
  message: string
  entering: boolean
  leaving: boolean
}

export function useErrorToastStack() {
  const toastIdRef = useRef(0)
  const toastTimersRef = useRef<Map<number, number[]>>(new Map())
  const [toasts, setToasts] = useState<ErrorToast[]>([])

  const dismissToast = useCallback((toastId: number) => {
    setToasts((currentToasts) =>
      currentToasts.map((toast) =>
        toast.id === toastId ? { ...toast, leaving: true } : toast,
      ),
    )

    const removeTimerId = window.setTimeout(() => {
      setToasts((currentToasts) =>
        currentToasts.filter((toast) => toast.id !== toastId),
      )

      const timerIds = toastTimersRef.current.get(toastId) ?? []

      for (const timerId of timerIds) {
        window.clearTimeout(timerId)
      }

      toastTimersRef.current.delete(toastId)
    }, 260)

    const timerIds = toastTimersRef.current.get(toastId) ?? []
    toastTimersRef.current.set(toastId, [...timerIds, removeTimerId])
  }, [])

  const showError = useCallback(
    (message: string | null) => {
      if (!message) {
        return
      }

      const toastId = toastIdRef.current + 1
      toastIdRef.current = toastId

      setToasts((currentToasts) => [
        {
          id: toastId,
          message,
          entering: true,
          leaving: false,
        },
        ...currentToasts,
      ])

      const enterTimerId = window.setTimeout(() => {
        setToasts((currentToasts) =>
          currentToasts.map((toast) =>
            toast.id === toastId ? { ...toast, entering: false } : toast,
          ),
        )
      }, 20)

      const leaveTimerId = window.setTimeout(() => {
        dismissToast(toastId)
      }, 4500)

      toastTimersRef.current.set(toastId, [enterTimerId, leaveTimerId])
    },
    [dismissToast],
  )

  useEffect(() => {
    return () => {
      for (const timerIds of toastTimersRef.current.values()) {
        for (const timerId of timerIds) {
          window.clearTimeout(timerId)
        }
      }

      toastTimersRef.current.clear()
    }
  }, [])

  return {
    dismissToast,
    showError,
    toasts,
  }
}

export function ErrorToastStack({
  onDismiss,
  toasts,
}: {
  onDismiss: (toastId: number) => void
  toasts: ErrorToast[]
}) {
  if (!toasts.length) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-5 top-4 z-[100] flex w-[min(420px,calc(100vw-2.5rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto rounded-lg border border-destructive/40 bg-destructive px-4 py-3 text-sm text-destructive-foreground shadow-lg transition-all duration-300 ease-out"
          style={{
            opacity: toast.entering || toast.leaving ? 0 : 1,
            transform:
              toast.entering || toast.leaving
                ? "translateX(calc(100% + 24px)) scale(0.98)"
                : "translateX(0) scale(1)",
          }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1 font-medium">{toast.message}</div>
            <button
              className="rounded-sm opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive-foreground/70"
              type="button"
              onClick={() => onDismiss(toast.id)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
