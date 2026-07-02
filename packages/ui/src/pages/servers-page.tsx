import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  MoreVertical,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"

import { TeamSpeak } from "@/api/teamspeak"
import { useAuth, type QueryUser } from "@/auth/auth-context"
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

const rowsPerPageOptions = [25, 50, 75, -1] as const

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

function isUsableServerId(value: string | number | undefined | null) {
  return (
    value !== undefined &&
    value !== null &&
    String(value) !== "" &&
    String(value) !== "0"
  )
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
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
            {action.server.virtualserverName}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              disabled={busy}
              type="button"
              variant="outline"
              onClick={onCancel}
            >
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
        "relative h-5 w-10 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        online ? "bg-primary/80 hover:bg-primary" : "bg-muted-foreground/25",
      )}
      disabled={disabled}
      type="button"
      onClick={() => onChangeStatus(server)}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform",
          online ? "left-5" : "left-0.5",
        )}
      />
    </button>
  )
}

export function ServersPage() {
  const location = useLocation()
  const locationState = location.state as ServersLocationState | null
  const { queryUser, serverId, saveServerId, removeServerId, saveQueryUser } =
    useAuth()
  const [servers, setServers] = useState<ServerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [rowsPerPage, setRowsPerPage] =
    useState<(typeof rowsPerPageOptions)[number]>(25)
  const [page, setPage] = useState(0)

const firstOnlineServer = useMemo(
  () =>
    servers.find((server) => !isOffline(server.virtualserverStatus)),
  [servers],
)

const selectedServerId = useMemo(() => {
  if (isUsableServerId(queryUser.virtualserverId)) {
    return queryUser.virtualserverId
  }

  if (isUsableServerId(serverId)) {
    return serverId
  }

  return firstOnlineServer?.virtualserverId
}, [firstOnlineServer?.virtualserverId, queryUser.virtualserverId, serverId])

  const totalPages = useMemo(() => {
    if (rowsPerPage === -1) {
      return 1
    }

    return Math.max(1, Math.ceil(servers.length / rowsPerPage))
  }, [rowsPerPage, servers.length])

  const visibleServers = useMemo(() => {
    if (rowsPerPage === -1) {
      return servers
    }

    const start = page * rowsPerPage

    return servers.slice(start, start + rowsPerPage)
  }, [page, rowsPerPage, servers])

  const visibleFrom = servers.length === 0 ? 0 : page * rowsPerPage + 1
  const visibleTo =
    rowsPerPage === -1
      ? servers.length
      : Math.min(servers.length, (page + 1) * rowsPerPage)

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
  
  useEffect(() => {
  const hasSelectedServer =
    isUsableServerId(queryUser.virtualserverId) || isUsableServerId(serverId)

  if (loading || actionBusy || hasSelectedServer || !firstOnlineServer) {
    return
  }

  void selectServer(firstOnlineServer.virtualserverId).catch((selectError) => {
    setError(getErrorMessage(selectError))
  })
}, [
  actionBusy,
  firstOnlineServer,
  loading,
  queryUser.virtualserverId,
  selectServer,
  serverId,
])

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
    setPage((currentPage) => Math.min(currentPage, totalPages - 1))
  }, [totalPages])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setServers((currentServers) =>
        currentServers.map((server) =>
          isOffline(server.virtualserverStatus)
            ? server
            : {
                ...server,
                virtualserverUptime:
                  normalizeUptime(server.virtualserverUptime) + 1,
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
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Servers List</h1>
          <p className="text-sm text-muted-foreground">
            Manage your TeamSpeak virtual servers
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

      <Card className="overflow-hidden rounded-sm shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-16 hover:bg-transparent">
                <TableHead className="w-14" />
                <TableHead className="w-24 text-xs font-semibold">
                  Select
                </TableHead>
                <TableHead className="text-xs font-semibold">Name</TableHead>
                <TableHead className="w-28 text-xs font-semibold">
                  Port
                </TableHead>
                <TableHead className="w-32 text-xs font-semibold">
                  Clients
                </TableHead>
                <TableHead className="w-48 text-xs font-semibold">
                  Uptime (d:h:m:s)
                </TableHead>
                <TableHead className="w-32 text-xs font-semibold">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow className="h-20">
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Loading servers...
                  </TableCell>
                </TableRow>
              ) : servers.length === 0 ? (
                <TableRow className="h-20">
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No virtual servers found.
                  </TableCell>
                </TableRow>
              ) : (
                visibleServers.map((server) => {
                  const offline = isOffline(server.virtualserverStatus)
                  const selected = sameServerId(
                    selectedServerId,
                    server.virtualserverId,
                  )

                  return (
                    <TableRow
                      key={String(server.virtualserverId)}
                      className="h-16 hover:bg-muted/30"
                      data-state={selected ? "selected" : undefined}
                    >
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label="Open server actions"
                              size="icon"
                              variant="ghost"
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-40">
                            <DropdownMenuItem asChild disabled={offline}>
                              <Link
                                className={cn(
                                  offline && "pointer-events-none opacity-50",
                                )}
                                to="/server/edit"
                              >
                                <Edit className="size-4" />
                                Edit Server
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
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
                        {server.virtualserverClientsonline}/
                        {server.virtualserverMaxclients}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatUptime(server.virtualserverUptime)}
                      </TableCell>
                      <TableCell>
                        <StatusControl
                          disabled={loading || actionBusy}
                          server={server}
                          onChangeStatus={changeServerStatus}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          <div className="flex min-h-14 items-center justify-end gap-8 border-t px-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>Rows per page:</span>
              <select
                className="h-8 rounded-md border border-transparent bg-transparent px-2 text-foreground outline-none hover:border-border focus:border-border"
                value={rowsPerPage}
                onChange={(event) => {
                  setRowsPerPage(Number(event.target.value) as typeof rowsPerPage)
                  setPage(0)
                }}
              >
                {rowsPerPageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === -1 ? "All" : option}
                  </option>
                ))}
              </select>
            </div>

            <span>
              {visibleFrom}-{visibleTo} of {servers.length}
            </span>

            <div className="flex items-center gap-1">
              <Button
                disabled={page === 0 || rowsPerPage === -1}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setPage((currentPage) => currentPage - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                disabled={page >= totalPages - 1 || rowsPerPage === -1}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setPage((currentPage) => currentPage + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* <Button
        asChild
        className="fixed bottom-6 right-6 z-30 size-12 rounded-full shadow-lg"
        size="icon"
      >
        <Link aria-label="Create server" to="/server/create">
          <Plus className="size-5" />
        </Link>
      </Button> */}

      <ConfirmDialog
        action={confirmAction}
        busy={actionBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmCurrentAction}
      />
    </div>
  )
}
