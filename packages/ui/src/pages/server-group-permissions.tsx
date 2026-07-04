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
import { AppModal } from "@/components/app-modal"
import { AppSelect } from "@/components/app-select"
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

type ServerGroup = {
  name: string
  sgid: string | number
  type: string | number
  [key: string]: unknown
}

type Permission = {
  permdesc?: string
  permid: string | number
  permname?: string
  permnegated?: string | number | boolean | null
  permskip?: string | number | boolean | null
  permvalue?: string | number | null
  __granted?: boolean
  [key: string]: unknown
}

type RowsPerPage = 50 | 100 | 150 | "all"

const rowsPerPageOptions: RowsPerPage[] = [50, 100, 150, "all"]

const availablePermissionCache = new Map<string, Permission[]>()
const availablePermissionFlights = new Map<string, Promise<Permission[]>>()
const groupCache = new Map<string, ServerGroup[]>()
const groupFlights = new Map<string, Promise<ServerGroup[]>>()
const permissionCache = new Map<string, Permission[]>()
const permissionFlights = new Map<string, Promise<Permission[]>>()

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message)
  }
  if (typeof error === "string") return error
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

function isChecked(value: unknown) {
  return value === true || value === 1 || value === "1"
}

function mergePermissions(
  availablePermissions: Permission[],
  grantedPermissions: Permission[],
) {
  if (!availablePermissions.length) {
    return grantedPermissions.map((permission) => ({
      ...permission,
      __granted: true,
    }))
  }

  const mergedPermissions = availablePermissions.map((permission) => {
    const grantedPermission = grantedPermissions.find(
      (granted) => getPermissionKey(granted) === getPermissionKey(permission),
    )

    if (!grantedPermission) {
      return {
        ...permission,
        __granted: false,
        permnegated: null,
        permskip: null,
        permvalue: null,
      }
    }

    return {
      ...permission,
      ...grantedPermission,
      __granted: true,
    }
  })

  const knownPermissionIds = new Set(mergedPermissions.map(getPermissionKey))
  const missingGrantedPermissions = grantedPermissions
    .filter((permission) => !knownPermissionIds.has(getPermissionKey(permission)))
    .map((permission) => ({
      ...permission,
      __granted: true,
    }))

  return [...mergedPermissions, ...missingGrantedPermissions]
}

function PermissionFlag({
  checked,
  label,
}: {
  checked: boolean
  label: string
}) {
  return (
    <div className="flex justify-center">
      <Checkbox aria-label={label} checked={checked} disabled />
    </div>
  )
}

export function ServerGroupPermissions() {
  const navigate = useNavigate()
  const { sgid } = useParams()
  const { queryUser, saveQueryUser, saveServerId, serverId } = useAuth()
  const queryUserRef = useRef(queryUser)
  const selectServerFlightRef = useRef<ReturnType<
    typeof TeamSpeak.selectServer
  > | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const { dismissToast, showError, toasts } = useToastStack()
  const [availablePermissions, setAvailablePermissions] = useState<
    Permission[]
  >([])
  const [grantedPermissions, setGrantedPermissions] = useState<Permission[]>([])
  const [groups, setGroups] = useState<ServerGroup[]>([])
  const [filter, setFilter] = useState("")
  const [onlyGranted, setOnlyGranted] = useState(true)
  const [rowsPerPage, setRowsPerPage] = useState<RowsPerPage>(50)
  const [page, setPage] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [entityLoading, setEntityLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionPermission, setActionPermission] = useState<Permission | null>(
    null,
  )
  const [actionMenuPosition, setActionMenuPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const [editingPermission, setEditingPermission] = useState<Permission | null>(
    null,
  )
  const [deletePermission, setDeletePermission] = useState<Permission | null>(
    null,
  )
  const [editedValue, setEditedValue] = useState("")
  const [editedSkip, setEditedSkip] = useState(false)
  const [editedNegated, setEditedNegated] = useState(false)

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
  }, [sgid, filter, onlyGranted, rowsPerPage])

  const selectedServerId = useMemo(() => {
    if (isUsableServerId(queryUser.virtualserverId))
      return queryUser.virtualserverId
    if (isUsableServerId(serverId)) return serverId
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

    if (!selectServerFlightRef.current) {
      selectServerFlightRef.current = TeamSpeak.selectServer(
        validSelectedServerId,
      ).finally(() => {
        selectServerFlightRef.current = null
      })
    }

    const nextQueryUser = await selectServerFlightRef.current
    saveServerId(validSelectedServerId)
    if (nextQueryUser) {
      queryUserRef.current = nextQueryUser
      saveQueryUser(nextQueryUser)
    }
    return nextQueryUser
  }, [saveQueryUser, saveServerId, selectedServerId])

  const serverCacheKey = selectedServerId
    ? String(selectedServerId)
    : "__unknown__"

  const loadAvailablePermissions = useCallback(async () => {
    await ensureSelectedServer()
    const cached = availablePermissionCache.get(serverCacheKey)
    if (cached) return cached

    let flight = availablePermissionFlights.get(serverCacheKey)
    if (!flight) {
      flight = TeamSpeak.execute<Permission[]>("permissionlist")
        .then((permissions) => {
          availablePermissionCache.set(serverCacheKey, permissions)
          return permissions
        })
        .finally(() => availablePermissionFlights.delete(serverCacheKey))

      availablePermissionFlights.set(serverCacheKey, flight)
    }

    return flight
  }, [ensureSelectedServer, serverCacheKey])

  const loadGroups = useCallback(async () => {
    await ensureSelectedServer()
    const cached = groupCache.get(serverCacheKey)
    if (cached) return cached

    let flight = groupFlights.get(serverCacheKey)
    if (!flight) {
      flight = TeamSpeak.execute<ServerGroup[]>("servergrouplist")
        .then((nextGroups) => {
          groupCache.set(serverCacheKey, nextGroups)
          return nextGroups
        })
        .finally(() => groupFlights.delete(serverCacheKey))

      groupFlights.set(serverCacheKey, flight)
    }

    return flight
  }, [ensureSelectedServer, serverCacheKey])

  const getPermissions = useCallback(
    async (groupId: string | number) => {
      const key = serverCacheKey + ":servergroup:" + String(groupId)
      const cached = permissionCache.get(key)
      if (cached) return cached

      let flight = permissionFlights.get(key)
      if (!flight) {
        flight = ensureSelectedServer()
          .then(() =>
            TeamSpeak.execute<Permission[]>("servergrouppermlist", {
              sgid: groupId,
            }),
          )
          .then((permissions) => {
            permissionCache.set(key, permissions)
            return permissions
          })
          .finally(() => permissionFlights.delete(key))

        permissionFlights.set(key, flight)
      }

      return flight
    },
    [ensureSelectedServer, serverCacheKey],
  )

  const refreshPermissions = useCallback(
    async (groupId: string | number) => {
      const key = serverCacheKey + ":servergroup:" + String(groupId)
      permissionCache.delete(key)
      permissionFlights.delete(key)
      const permissions = await TeamSpeak.execute<Permission[]>(
        "servergrouppermlist",
        { sgid: groupId },
      )
      permissionCache.set(key, permissions)
      return permissions
    },
    [serverCacheKey],
  )

  useEffect(() => {
    let active = true
    setInitialLoading(availablePermissions.length === 0 || groups.length === 0)

    const availablePermissionsPromise = loadAvailablePermissions()
      .then((permissions) => {
        if (!active) return
        setAvailablePermissions(permissions)
      })
      .catch((error: unknown) => active && showError(getErrorMessage(error)))

    const groupsPromise = loadGroups()
      .then((data) => {
        if (!active) return
        setGroups(data)
        if (!sgid && data[0]) {
          void getPermissions(data[0].sgid).then((permissions) => {
            if (active) setGrantedPermissions(permissions)
          })
          navigate("/permissions/servergroup/" + String(data[0].sgid), {
            replace: true,
          })
        }
      })
      .catch((error: unknown) => active && showError(getErrorMessage(error)))

    Promise.allSettled([availablePermissionsPromise, groupsPromise]).finally(
      () => active && setInitialLoading(false),
    )

    return () => {
      active = false
    }
  }, [
    availablePermissions.length,
    getPermissions,
    groups.length,
    loadAvailablePermissions,
    loadGroups,
    navigate,
    sgid,
    showError,
  ])

  useEffect(() => {
    if (!sgid) return
    let active = true
    const key = serverCacheKey + ":servergroup:" + String(sgid)
    const cached = permissionCache.get(key)
    if (cached) {
      setGrantedPermissions(cached)
      setEntityLoading(false)
      return () => {
        active = false
      }
    }

    setEntityLoading(true)
    getPermissions(sgid)
      .then((permissions) => active && setGrantedPermissions(permissions))
      .catch((error: unknown) => active && showError(getErrorMessage(error)))
      .finally(() => active && setEntityLoading(false))

    return () => {
      active = false
    }
  }, [getPermissions, serverCacheKey, sgid, showError])

  const permissionList = useMemo(() => {
    const query = filter.trim().toLowerCase()

    return mergePermissions(availablePermissions, grantedPermissions).filter(
      (permission) => {
        if (onlyGranted && !permission.__granted) return false

        if (!query) return true

        return [permission.permname, permission.permdesc, permission.permid]
          .filter((value) => value !== undefined && value !== null)
          .some((value) => String(value).toLowerCase().includes(query))
      },
    )
  }, [availablePermissions, filter, grantedPermissions, onlyGranted])

  const pageCount = useMemo(() => {
    if (rowsPerPage === "all") return 1
    return Math.max(1, Math.ceil(permissionList.length / rowsPerPage))
  }, [permissionList.length, rowsPerPage])

  const safePage = Math.min(page, pageCount - 1)
  const pageStart = rowsPerPage === "all" ? 0 : safePage * rowsPerPage
  const pageEnd =
    rowsPerPage === "all"
      ? permissionList.length
      : Math.min(permissionList.length, pageStart + rowsPerPage)

  const paginatedPermissionList = useMemo(
    () =>
      rowsPerPage === "all"
        ? permissionList
        : permissionList.slice(pageStart, pageEnd),
    [pageEnd, pageStart, permissionList, rowsPerPage],
  )

  const paginationStart = permissionList.length ? pageStart + 1 : 0
  const paginationEnd = permissionList.length ? pageEnd : 0

  const busy =
    entityLoading ||
    submitting ||
    (initialLoading && grantedPermissions.length === 0)
  const loading =
    initialLoading &&
    availablePermissions.length === 0 &&
    grantedPermissions.length === 0
  const groupOptions = useMemo(() => {
    const hasSelectedGroup = groups.some(
      (group) => String(group.sgid) === String(sgid),
    )
    const selectedGroupFallback =
      sgid && !hasSelectedGroup
        ? [{ label: `Group ${sgid}`, value: String(sgid) }]
        : []

    return [
      ...selectedGroupFallback,
      ...groups.map((group) => ({
        label: `${group.name} (${group.sgid})`,
        value: String(group.sgid),
      })),
    ]
  }, [groups, sgid])

  const startEdit = (permission: Permission) => {
    setActionPermission(null)
    setActionMenuPosition(null)
    setEditingPermission(permission)
    setEditedValue(
      permission.permvalue !== undefined && permission.permvalue !== null
        ? String(permission.permvalue)
        : "",
    )
    setEditedSkip(isChecked(permission.permskip))
    setEditedNegated(isChecked(permission.permnegated))
  }

  const startRemove = (permission: Permission) => {
    setActionPermission(null)
    setActionMenuPosition(null)
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
    const openUp =
      triggerRect.top + menuHeight > window.innerHeight - viewportPadding

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
    if (!sgid || !editingPermission) return

    setSubmitting(true)
    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("servergroupaddperm", {
        sgid,
        permid: editingPermission.permid,
        permnegated: editedNegated ? 1 : 0,
        permskip: editedSkip ? 1 : 0,
        permvalue: Number(editedValue),
      })
      setEditingPermission(null)
      setGrantedPermissions(await refreshPermissions(sgid))
    } catch (error) {
      showError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const removePermission = async () => {
    if (!sgid || !deletePermission) return

    setSubmitting(true)
    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("servergroupdelperm", {
        sgid,
        permid: deletePermission.permid,
      })
      setDeletePermission(null)
      setGrantedPermissions(await refreshPermissions(sgid))
    } catch (error) {
      showError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Server Group Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(180px,1fr)_auto]">
            <AppSelect
              className="h-10"
              disabled={busy || groups.length === 0}
              options={groupOptions}
              placeholder="Server Group"
              value={sgid ?? ""}
              onChange={(value) => navigate("/permissions/servergroup/" + value)}
            />

            <Input
              className="h-10"
              disabled={busy && permissionList.length === 0}
              placeholder="Filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />

            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
              <Checkbox
                checked={onlyGranted}
                disabled={busy && permissionList.length === 0}
                onCheckedChange={(checked) => setOnlyGranted(checked === true)}
              />
              <span className="whitespace-nowrap">Only granted</span>
            </label>
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <div className="overflow-visible rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14" />
                    <TableHead>Permission</TableHead>
                    <TableHead className="w-24 text-left">Value</TableHead>
                    <TableHead className="w-24 text-center">Skip</TableHead>
                    <TableHead className="w-24 text-center">Negate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPermissionList.length ? (
                    paginatedPermissionList.map((permission) => {
                      const permissionKey = getPermissionKey(permission)

                      return (
                        <TableRow
                          className="overflow-visible"
                          key={permissionKey}
                        >
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
                          <TableCell className="text-leftt">
                            {String(permission.permvalue ?? "")}
                          </TableCell>
                          <TableCell>
                            <PermissionFlag
                              checked={isChecked(permission.permskip)}
                              label="Skip"
                            />
                          </TableCell>
                          <TableCell>
                            <PermissionFlag
                              checked={isChecked(permission.permnegated)}
                              label="Negated"
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-24 text-center text-muted-foreground"
                        colSpan={5}
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
                  <AppSelect
                    className="h-8 min-h-8 w-20 border-transparent bg-transparent px-2 shadow-none hover:border-border"
                    disabled={busy}
                    value={String(rowsPerPage)}
                    options={rowsPerPageOptions.map((option) => ({
                      label: option === "all" ? "All" : String(option),
                      value: String(option),
                    }))}
                    onChange={(value) => {
                      const nextValue =
                        value === "all"
                          ? "all"
                          : Number(value)

                      setRowsPerPage(nextValue as RowsPerPage)
                      setPage(0)
                    }}
                  />
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
                    onClick={() =>
                      setPage((currentPage) => Math.max(0, currentPage - 1))
                    }
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    aria-label="Next page"
                    disabled={
                      busy || rowsPerPage === "all" || safePage >= pageCount - 1
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setPage((currentPage) =>
                        Math.min(pageCount - 1, currentPage + 1),
                      )
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

      <AppModal
        open={Boolean(editingPermission)}
        preventClose={submitting}
        title={editingPermission ? getPermissionTitle(editingPermission) : null}
        footer={
          <>
            <Button
              disabled={submitting}
              type="button"
              onClick={savePermission}
            >
              Save
            </Button>
            <Button
              disabled={submitting}
              type="button"
              variant="outline"
              onClick={() => setEditingPermission(null)}
            >
              Cancel
            </Button>
          </>
        }
        onClose={() => setEditingPermission(null)}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="permission-value"
            >
              Value
            </label>
            <Input
              id="permission-value"
              disabled={submitting}
              type="number"
              value={editedValue}
              onChange={(event) => setEditedValue(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex h-10 items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={editedSkip}
                disabled={submitting}
                onCheckedChange={(checked) =>
                  setEditedSkip(checked === true)
                }
              />
              <span>Skip</span>
            </label>

            <label className="flex h-10 items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={editedNegated}
                disabled={submitting}
                onCheckedChange={(checked) =>
                  setEditedNegated(checked === true)
                }
              />
              <span>Negated</span>
            </label>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(deletePermission)}
        preventClose={submitting}
        title="Remove Permission"
        footer={
          <>
            <Button
              disabled={submitting}
              type="button"
              onClick={removePermission}
            >
              Yes
            </Button>
            <Button
              disabled={submitting}
              type="button"
              variant="outline"
              onClick={() => setDeletePermission(null)}
            >
              Cancel
            </Button>
          </>
        }
        onClose={() => setDeletePermission(null)}
      >
        <p className="text-sm text-muted-foreground">
          Do you really want to remove the{" "}
          <span className="font-semibold text-foreground">
            {deletePermission?.permname}
          </span>{" "}
          permission values?
        </p>
      </AppModal>
    </div>
  )
}
