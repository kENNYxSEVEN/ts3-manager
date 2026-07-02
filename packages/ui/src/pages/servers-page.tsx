import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Edit, MoreVertical, Plus, RefreshCw, Trash2 } from "lucide-react"

import { TeamSpeak } from "@/api/teamspeak"
import { useAuth, type QueryUser } from "@/auth/auth-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type ServerRow = {
  virtualserverId: string | number
  virtualserverName: string
  virtualserverPort: string | number
  virtualserverClientsonline: string | number
  virtualserverMaxclients: string | number
  virtualserverUptime: string | number
  virtualserverStatus: string
}

type ConfirmAction =
  | { type: "stop"; server: ServerRow }
  | { type: "delete"; server: ServerRow }
  | null

type ServersLocationState = {
  from?: string
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message)
  }

  if (typeof error === "string") {
    return error
  }

  return "TeamSpeak request failed."
}

function isOffline(status: string) {
  return status === "offline"
}

function normalizeUptime(value: string | number) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function formatUptime(secondsValue: string | number) {
  const totalSeconds = normalizeUptime(secondsValue)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${days}:${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(2, "0")}`
}

function normalizeServer(server: ServerRow): ServerRow {
  return {
    ...server,
    virtualserverUptime: normalizeUptime(server.virtualserverUptime),
  }
}

function sameServerId(left: string | number | undefined, right: string | number) {
  return left !== undefined && String(left) === String(right)
}

function ConfirmDialog({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: ConfirmAction
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!action) {
    return null
  }

  const isStop = action.type === "stop"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>{isStop ? "Stop Server" : "Delete Server"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isStop
              ? "Do really want to stop this virtual server instance?"
              : "Do really want to delete this virtual server instance?"}
          </p>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            {action.server.virtualserverName}
          </div>
          <div className="flex justify-end gap-2">
            <Button disabled={busy} type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              type="button"
              variant={isStop ? "default" : "destructive"}
              onClick={onConfirm}
            >
              {busy ? "Working..." : isStop ? "Stop" : "Delete"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusControl({
  server,
  disabled,
  onChangeStatus,
}: {
  server: ServerRow
  disabled: boolean
  onChangeStatus: (server: ServerRow) => void
}) {
  const online = !isOffline(server.virtualserverStatus)

  return (
    <button
      aria-label={online ? "Stop server" : "Start server"}
      aria-pressed={online}
      className={cn(
        "relative h-6 w-11 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        online ? "border-primary bg-primary" : "border-input bg-muted",
      )}
      disabled={disabled}
      type="button"
      onClick={() => onChangeStatus(server)}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-background shadow transition-transform",
          online ? "left-5" : "left-0.5",
        )}
      />
    </button>
  )
}

export function ServersPage() {
  const location = useLocation()
  const locationState = location.state as ServersLocationState | null
  const {
    queryUser,
    serverId,
    saveServerId,
    removeServerId,
    saveQueryUser,
  } = useAuth()
  const [servers, setServers] = useState<ServerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  const selectedServerId = useMemo(
    () => queryUser.virtualserverId ?? serverId,
    [queryUser.virtualserverId, serverId],
  )

  const loadQueryUser = useCallback(async () => {
    const userInfo = await TeamSpeak.execute<QueryUser[]>("whoami")
    const nextQueryUser = userInfo[0] ?? {}

    saveQueryUser(nextQueryUser)

    return nextQueryUser
  }, [saveQueryUser])

  const selectServer = useCallback(
    async (sid: string | number) => {
      const nextQueryUser = await TeamSpeak.selectServer(sid)

      saveServerId(sid)
      saveQueryUser(nextQueryUser ?? {})
    },
    [saveQueryUser, saveServerId],
  )

  const loadServers = useCallback(
    async (
      options: { selectFirstOnline?: boolean; refreshQueryUser?: boolean } = {},
    ) => {
      setLoading(true)
      setError(null)

      try {
        const response = await TeamSpeak.execute<ServerRow[]>("serverlist")
        const nextServers = response.map(normalizeServer)

        setServers(nextServers)

        if (options.selectFirstOnline) {
          const onlineServer = nextServers.find(
            (server) => !isOffline(server.virtualserverStatus),
          )

          if (onlineServer) {
            await selectServer(onlineServer.virtualserverId)
          }
        }

        if (options.refreshQueryUser !== false) {
          await loadQueryUser()
        }
      } catch (loadError) {
        setError(getErrorMessage(loadError))
      } finally {
        setLoading(false)
      }
    },
    [loadQueryUser, selectServer],
  )

  useEffect(() => {
    void loadServers({ selectFirstOnline: locationState?.from === "/login" })
  }, [loadServers, locationState?.from])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setServers((currentServers) =>
        currentServers.map((server) =>
          isOffline(server.virtualserverStatus)
            ? server
            : {
                ...server,
                virtualserverUptime: normalizeUptime(server.virtualserverUptime) + 1,
              },
        ),
      )
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [])

  const handleSelectServer = async (server: ServerRow) => {
    if (isOffline(server.virtualserverStatus) || loading || actionBusy) {
      return
    }

    setActionBusy(true)
    setError(null)

    try {
      await selectServer(server.virtualserverId)
    } catch (selectError) {
      setError(getErrorMessage(selectError))
    } finally {
      setActionBusy(false)
    }
  }

  const startServer = async (server: ServerRow) => {
    setActionBusy(true)
    setError(null)

    try {
      await TeamSpeak.execute("serverstart", { sid: server.virtualserverId })
      await selectServer(server.virtualserverId)
      await loadServers()
    } catch (startError) {
      setError(getErrorMessage(startError))
    } finally {
      setActionBusy(false)
    }
  }

  const stopServer = async (server: ServerRow) => {
    setActionBusy(true)
    setError(null)

    try {
      await TeamSpeak.execute("serverstop", { sid: server.virtualserverId })
      setConfirmAction(null)
      await loadServers({ refreshQueryUser: false })

      if (sameServerId(selectedServerId, server.virtualserverId)) {
        removeServerId()
        saveQueryUser({})
      }
    } catch (stopError) {
      setError(getErrorMessage(stopError))
    } finally {
      setActionBusy(false)
    }
  }

  const deleteServer = async (server: ServerRow) => {
    setActionBusy(true)
    setError(null)

    try {
      await TeamSpeak.execute("serverdelete", { sid: server.virtualserverId })
      setConfirmAction(null)
      await loadServers()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setActionBusy(false)
    }
  }

  const changeServerStatus = (server: ServerRow) => {
    if (isOffline(server.virtualserverStatus)) {
      void startServer(server)
      return
    }

    setConfirmAction({ type: "stop", server })
  }

  const confirmCurrentAction = () => {
    if (!confirmAction) {
      return
    }

    if (confirmAction.type === "stop") {
      void stopServer(confirmAction.server)
      return
    }

    void deleteServer(confirmAction.server)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Server List</h1>
          <p className="text-sm text-muted-foreground">
            Manage TeamSpeak virtual servers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={loading || actionBusy}
            type="button"
            variant="outline"
            onClick={() => void loadServers()}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button asChild>
            <Link to="/server/create">
              <Plus className="size-4" />
              Create Server
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Actions</TableHead>
                <TableHead className="w-16">Select</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead>Uptime</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Loading servers...
                  </TableCell>
                </TableRow>
              ) : servers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No virtual servers found.
                  </TableCell>
                </TableRow>
              ) : (
                servers.map((server) => {
                  const offline = isOffline(server.virtualserverStatus)
                  const selected = sameServerId(
                    selectedServerId,
                    server.virtualserverId,
                  )

                  return (
                    <TableRow key={String(server.virtualserverId)} data-state={selected ? "selected" : undefined}>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button aria-label="Open server actions" size="icon" variant="ghost">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-40">
                            <DropdownMenuItem asChild disabled={offline}>
                              <Link
                                className={cn(offline && "pointer-events-none opacity-50")}
                                to="/server/edit"
                              >
                                <Edit className="size-4" />
                                Edit Server
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() =>
                                setConfirmAction({ type: "delete", server })
                              }
                            >
                              <Trash2 className="size-4" />
                              Delete Server
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        <input
                          aria-label={`Select ${server.virtualserverName}`}
                          checked={selected}
                          className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={offline || loading || actionBusy}
                          name="selected-server"
                          type="radio"
                          onChange={() => void handleSelectServer(server)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {server.virtualserverName}
                      </TableCell>
                      <TableCell>{server.virtualserverPort}</TableCell>
                      <TableCell>
                        {server.virtualserverClientsonline}/{server.virtualserverMaxclients}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatUptime(server.virtualserverUptime)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <StatusControl
                            disabled={loading || actionBusy}
                            server={server}
                            onChangeStatus={changeServerStatus}
                          />
                          <Badge variant={offline ? "outline" : "secondary"}>
                            {server.virtualserverStatus}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        action={confirmAction}
        busy={actionBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmCurrentAction}
      />
    </div>
  )
}
