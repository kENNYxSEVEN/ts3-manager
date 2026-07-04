import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import { createPortal } from "react-dom"
import { useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, MoreVertical } from "lucide-react"

import { TeamSpeak } from "@/api/teamspeak"
import { useAuth } from "@/auth/auth-context"
import { ToastStack, useToastStack } from "@/components/toast-stack"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type ChannelRow = {
  cid: string | number
  channelName: string
  [key: string]: unknown
}

type Permission = {
  permdesc?: string
  permid: string | number
  permname?: string
  permnegated?: string | number | boolean | null
  permskip?: string | number | boolean | null
  permvalue?: string | number | null
  [key: string]: unknown
}

type ChannelPermissionsData = {
  availablePermissions: Permission[]
  channels: ChannelRow[]
}

const channelPermissionDataCache = new Map<string, ChannelPermissionsData>()
const channelPermissionDataFlights = new Map<
  string,
  Promise<ChannelPermissionsData>
>()
const channelPermissionCache = new Map<string, Permission[]>()
const channelPermissionFlights = new Map<string, Promise<Permission[]>>()
const rowsPerPageOptions = [50, 100, 150, "all"] as const
type RowsPerPage = (typeof rowsPerPageOptions)[number]

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

function isUsableServerId(value: string | number | undefined | null) {
  return (
    value !== undefined &&
    value !== null &&
    String(value) !== "" &&
    String(value) !== "0"
  )
}

function getPermissionKey(permission: Permission) {
  return String(permission.permid)
}

function getPermissionTitle(permission: Permission) {
  return permission.permdesc ?? permission.permname ?? String(permission.permid)
}

function mergePermissions(
  availablePermissions: Permission[],
  grantedPermissions: Permission[],
) {
  return availablePermissions.map((permission) => {
    const grantedPermission = grantedPermissions.find(
      (granted) => getPermissionKey(granted) === getPermissionKey(permission),
    )

    return {
      ...permission,
      ...(grantedPermission ?? {
        permnegated: null,
        permskip: null,
        permvalue: null,
      }),
    }
  })
}

export function ChannelPermissions() {
  const navigate = useNavigate()
  const { cid } = useParams()
  const { queryUser, saveQueryUser, saveServerId, serverId } = useAuth()
  const queryUserRef = useRef(queryUser)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const { dismissToast, showError, toasts } = useToastStack()
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([])
  const [grantedPermissions, setGrantedPermissions] = useState<Permission[]>([])
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [filter, setFilter] = useState("")
  const [onlyGranted, setOnlyGranted] = useState(true)
  const [rowsPerPage, setRowsPerPage] = useState<RowsPerPage>(50)
  const [page, setPage] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [channelLoading, setChannelLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionPermission, setActionPermission] = useState<Permission | null>(null)
  const [actionMenuPosition, setActionMenuPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const [editingPermission, setEditingPermission] = useState<Permission | null>(null)
  const [deletePermission, setDeletePermission] = useState<Permission | null>(null)
  const [editedValue, setEditedValue] = useState("")

  useEffect(() => {
    queryUserRef.current = queryUser
  }, [queryUser])

  useEffect(() => {
    if (!actionPermission) {
      setActionMenuPosition(null)
      return
    }

    const closeActionMenu = () => {
      setActionPermission(null)
      setActionMenuPosition(null)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        actionMenuRef.current &&
        event.target instanceof Node &&
        !actionMenuRef.current.contains(event.target)
      ) {
        closeActionMenu()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("resize", closeActionMenu)
    window.addEventListener("scroll", closeActionMenu, true)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("resize", closeActionMenu)
      window.removeEventListener("scroll", closeActionMenu, true)
    }
  }, [actionPermission])

  useEffect(() => {
    setPage(0)
  }, [cid, filter, onlyGranted, rowsPerPage])

  const selectedServerId = useMemo(() => {
    if (isUsableServerId(queryUser.virtualserverId)) {
      return queryUser.virtualserverId
    }

    if (isUsableServerId(serverId)) {
      return serverId
    }

    return undefined
  }, [queryUser.virtualserverId, serverId])

  const ensureSelectedServer = useCallback(async () => {
    if (!isUsableServerId(selectedServerId)) {
      throw new Error("No valid virtual server selected.")
    }

    const validSelectedServerId = selectedServerId as string | number
    const currentQueryUser = queryUserRef.current

    if (
      isUsableServerId(currentQueryUser.virtualserverId) &&
      String(currentQueryUser.virtualserverId) === String(validSelectedServerId)
    ) {
      saveServerId(validSelectedServerId)
      return currentQueryUser
    }

    const nextQueryUser = await TeamSpeak.selectServer(validSelectedServerId)

    saveServerId(validSelectedServerId)

    if (nextQueryUser) {
      saveQueryUser(nextQueryUser)
    }

    return nextQueryUser
  }, [saveQueryUser, saveServerId, selectedServerId])

  const serverCacheKey = selectedServerId ? String(selectedServerId) : "__unknown__"

  const loadGlobalData = useCallback(async () => {
    await ensureSelectedServer()

    const cachedData = channelPermissionDataCache.get(serverCacheKey)

    if (cachedData) {
      return cachedData
    }

    let flight = channelPermissionDataFlights.get(serverCacheKey)

    if (!flight) {
      flight = (async () => {
        const [nextAvailablePermissions, nextChannels] = await Promise.all([
          TeamSpeak.execute<Permission[]>("permissionlist"),
          TeamSpeak.execute<ChannelRow[]>("channellist"),
        ])

        const nextData = {
          availablePermissions: nextAvailablePermissions,
          channels: nextChannels,
        }

        channelPermissionDataCache.set(serverCacheKey, nextData)

        return nextData
      })().finally(() => {
        channelPermissionDataFlights.delete(serverCacheKey)
      })

      channelPermissionDataFlights.set(serverCacheKey, flight)
    }

    return flight
  }, [ensureSelectedServer, serverCacheKey])

  const getChannelPermissions = useCallback(
    async (channelId: string | number) => {
      const key = serverCacheKey + ":" + String(channelId)
      const cachedPermissions = channelPermissionCache.get(key)

      if (cachedPermissions) {
        return cachedPermissions
      }

      let flight = channelPermissionFlights.get(key)

      if (!flight) {
        flight = TeamSpeak.execute<Permission[]>("channelpermlist", {
          cid: channelId,
        })
          .then((permissions) => {
            channelPermissionCache.set(key, permissions)
            return permissions
          })
          .finally(() => {
            channelPermissionFlights.delete(key)
          })

        channelPermissionFlights.set(key, flight)
      }

      return flight
    },
    [serverCacheKey],
  )

  const refreshChannelPermissions = useCallback(
    async (channelId: string | number) => {
      const key = serverCacheKey + ":" + String(channelId)
      channelPermissionCache.delete(key)
      channelPermissionFlights.delete(key)

      const permissions = await TeamSpeak.execute<Permission[]>(
        "channelpermlist",
        { cid: channelId },
      )

      channelPermissionCache.set(key, permissions)

      return permissions
    },
    [serverCacheKey],
  )

  const reloadGrantedPermissions = useCallback(async () => {
    if (!cid) {
      return
    }

    setGrantedPermissions(await refreshChannelPermissions(cid))
  }, [cid, refreshChannelPermissions])

  useEffect(() => {
    let active = true

    setInitialLoading(availablePermissions.length === 0 || channels.length === 0)

    loadGlobalData()
      .then((data) => {
        if (!active) {
          return
        }

        setAvailablePermissions(data.availablePermissions)
        setChannels(data.channels)

        if (!cid && data.channels[0]) {
          navigate("/permissions/channel/" + String(data.channels[0].cid), {
            replace: true,
          })
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          showError(getErrorMessage(loadError))
        }
      })
      .finally(() => {
        if (active) {
          setInitialLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [availablePermissions.length, channels.length, cid, loadGlobalData, navigate, showError])

  useEffect(() => {
    if (!cid) {
      return
    }

    let active = true
    const key = serverCacheKey + ":" + String(cid)
    const cachedPermissions = channelPermissionCache.get(key)

    if (cachedPermissions) {
      setGrantedPermissions(cachedPermissions)
      setChannelLoading(false)
      return () => {
        active = false
      }
    }

    setChannelLoading(true)

    getChannelPermissions(cid)
      .then((permissions) => {
        if (active) {
          setGrantedPermissions(permissions)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          showError(getErrorMessage(loadError))
        }
      })
      .finally(() => {
        if (active) {
          setChannelLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [cid, getChannelPermissions, serverCacheKey, showError])


  const permissionList = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase()

    return mergePermissions(availablePermissions, grantedPermissions)
      .filter((permission) => !onlyGranted || permission.permvalue !== null)
      .filter((permission) => {
        if (!normalizedFilter) {
          return true
        }

        return [
          permission.permid,
          permission.permname,
          permission.permdesc,
          permission.permvalue,
        ]
          .filter((value) => value !== undefined && value !== null)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedFilter),
          )
      })
  }, [availablePermissions, filter, grantedPermissions, onlyGranted])

  const pageCount =
    rowsPerPage === "all"
      ? 1
      : Math.max(1, Math.ceil(permissionList.length / rowsPerPage))
  const safePage = Math.min(page, pageCount - 1)
  const pageStart = rowsPerPage === "all" ? 0 : safePage * rowsPerPage
  const pageEnd =
    rowsPerPage === "all"
      ? permissionList.length
      : Math.min(pageStart + rowsPerPage, permissionList.length)

  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(pageCount - 1)
    }
  }, [page, pageCount])

  const paginatedPermissionList = useMemo(
    () =>
      rowsPerPage === "all"
        ? permissionList
        : permissionList.slice(pageStart, pageEnd),
    [pageEnd, pageStart, permissionList, rowsPerPage],
  )

  const paginationStart = permissionList.length ? pageStart + 1 : 0
  const paginationEnd = permissionList.length ? pageEnd : 0

  const startEdit = (permission: Permission) => {
    setActionPermission(null)
    setEditingPermission(permission)
    setEditedValue(
      permission.permvalue !== undefined && permission.permvalue !== null
        ? String(permission.permvalue)
        : "",
    )
  }

  const startRemove = (permission: Permission) => {
    setActionPermission(null)
    setDeletePermission(permission)
  }

  const toggleActionMenu = (
    permission: Permission,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const permissionKey = getPermissionKey(permission)
    const currentPermissionKey = actionPermission
      ? getPermissionKey(actionPermission)
      : null

    if (currentPermissionKey === permissionKey) {
      setActionPermission(null)
      setActionMenuPosition(null)
      return
    }

    const triggerRect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 192
    const menuHeight = 104
    const gap = 6
    const viewportPadding = 8
    const openUp = triggerRect.top + menuHeight > window.innerHeight - viewportPadding

    setActionMenuPosition({
      left: Math.min(
        triggerRect.right + gap,
        window.innerWidth - menuWidth - viewportPadding,
      ),
      top: openUp
        ? Math.max(viewportPadding, triggerRect.bottom - menuHeight)
        : Math.max(viewportPadding, triggerRect.top),
    })
    setActionPermission(permission)
  }

  const savePermission = async () => {
    if (!cid || !editingPermission) {
      return
    }

    setSubmitting(true)

    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("channeladdperm", {
        cid,
        permid: editingPermission.permid,
        permvalue: Number(editedValue),
      })
      setEditingPermission(null)
      await reloadGrantedPermissions()
    } catch (saveError) {
      showError(getErrorMessage(saveError))
    } finally {
      setSubmitting(false)
    }
  }

  const removePermission = async () => {
    if (!cid || !deletePermission) {
      return
    }

    setSubmitting(true)

    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("channeldelperm", {
        cid,
        permid: deletePermission.permid,
      })
      setDeletePermission(null)
      await reloadGrantedPermissions()
    } catch (removeError) {
      showError(getErrorMessage(removeError))
    } finally {
      setSubmitting(false)
    }
  }

  const loading = initialLoading && availablePermissions.length === 0
  const busy = initialLoading || channelLoading || submitting

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Channel Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 overflow-visible">
          <div className="grid items-start gap-3 md:grid-cols-[minmax(220px,320px)_1fr_auto]">
            <select
              className="flex h-9 min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              value={cid ?? ""}
              onChange={(event) =>
                navigate("/permissions/channel/" + event.target.value)
              }
            >
              {channels.map((channel) => (
                <option key={channel.cid} value={String(channel.cid)}>
                  {channel.channelName}
                </option>
              ))}
            </select>

            <Input
              className="h-9 min-h-9"
              disabled={busy}
              placeholder="Filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />

            <label className="flex h-9 min-h-9 items-center gap-2 rounded-md border px-3 text-sm">
              <Checkbox
                checked={onlyGranted}
                disabled={busy}
                onCheckedChange={(checked) => setOnlyGranted(checked === true)}
              />
              only granted
            </label>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <div className="overflow-visible rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14" />
                    <TableHead>Permission</TableHead>
                    <TableHead className="w-36 text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPermissionList.length ? (
                    paginatedPermissionList.map((permission) => {
                      const permissionKey = getPermissionKey(permission)
                      return (
                        <TableRow className="overflow-visible" key={permissionKey}>
                          <TableCell className="relative overflow-visible">
                            <Button
                              aria-label="Permission actions"
                              disabled={busy}
                              size="icon"
                              type="button"
                              variant="ghost"
                              onClick={(event) =>
                                toggleActionMenu(permission, event)
                              }
                            >
                              <MoreVertical className="size-4" />
                            </Button>

                          </TableCell>
                          <TableCell className="min-w-0 whitespace-normal py-3">
                            <div className="font-medium leading-tight">
                              {permission.permname ?? permission.permid}
                            </div>
                            {permission.permdesc ? (
                              <div className="mt-1 text-xs leading-tight text-muted-foreground">
                                {permission.permdesc}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {String(permission.permvalue ?? "")}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-24 text-center text-muted-foreground"
                        colSpan={3}
                      >
                        No permissions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-end gap-6 border-t px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>Rows per page:</span>
                  <select
                    className="h-8 border-b bg-transparent px-2 text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busy}
                    value={String(rowsPerPage)}
                    onChange={(event) => {
                      const nextValue =
                        event.target.value === "all"
                          ? "all"
                          : Number(event.target.value)

                      setRowsPerPage(nextValue as RowsPerPage)
                      setPage(0)
                    }}
                  >
                    {rowsPerPageOptions.map((option) => (
                      <option key={String(option)} value={String(option)}>
                        {option === "all" ? "All" : option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-24 text-right text-foreground">
                  {paginationStart}-{paginationEnd} of {permissionList.length}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    aria-label="Previous page"
                    disabled={busy || rowsPerPage === "all" || safePage === 0}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    aria-label="Next page"
                    disabled={busy || rowsPerPage === "all" || safePage >= pageCount - 1}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setPage((currentPage) => Math.min(pageCount - 1, currentPage + 1))
                    }
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {actionPermission && actionMenuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={actionMenuRef}
              className="fixed z-50 w-48 overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-lg"
              style={{
                left: actionMenuPosition.left,
                top: actionMenuPosition.top,
              }}
            >
              <button
                className="block w-full px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                type="button"
                onClick={() => startEdit(actionPermission)}
              >
                Edit Permission
              </button>
              <button
                className="block w-full px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                type="button"
                onClick={() => startRemove(actionPermission)}
              >
                Remove Permission
              </button>
            </div>,
            document.body,
          )
        : null}

      {editingPermission ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>{getPermissionTitle(editingPermission)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">
                  Value
                </div>
                <input
                  className="h-9 w-full border-b border-border bg-transparent px-0 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={submitting}
                  type="number"
                  value={editedValue}
                  onChange={(event) => setEditedValue(event.target.value)}
                />
              </div>

              <div className="flex justify-end gap-6">
                <Button
                  className="px-0 font-semibold uppercase text-primary hover:text-primary"
                  disabled={submitting}
                  type="button"
                  variant="ghost"
                  onClick={() => void savePermission()}
                >
                  SAVE
                </Button>
                <Button
                  className="px-0 font-semibold uppercase text-primary hover:text-primary"
                  disabled={submitting}
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingPermission(null)}
                >
                  CANCEL
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {deletePermission ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Remove Permission</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <p className="text-sm leading-6 text-muted-foreground">
                Do you really want to remove the{" "}
                <span className="font-semibold text-foreground">
                  {deletePermission.permname}
                </span>{" "}
                permission values?
              </p>
              <div className="flex justify-end gap-6">
                <Button
                  className="px-0 font-semibold uppercase text-primary hover:text-primary"
                  disabled={submitting}
                  type="button"
                  variant="ghost"
                  onClick={() => void removePermission()}
                >
                  YES
                </Button>
                <Button
                  className="px-0 font-semibold uppercase text-primary hover:text-primary"
                  disabled={submitting}
                  type="button"
                  variant="ghost"
                  onClick={() => setDeletePermission(null)}
                >
                  CANCEL
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
