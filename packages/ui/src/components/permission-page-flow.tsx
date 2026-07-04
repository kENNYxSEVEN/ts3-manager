import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, MoreVertical } from "lucide-react"

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

export type Permission = {
  permdesc?: string
  permid: string | number
  permname?: string
  permnegated?: string | number | boolean | null
  permskip?: string | number | boolean | null
  permvalue?: string | number | null
  [key: string]: unknown
}

export type PermissionEditValues = {
  permnegated: boolean
  permskip: boolean
  permvalue: string
}

type EditableField = "permvalue" | "permskip" | "permnegated"

type SelectorOption = {
  label: string
  value: string
}

type PermissionSelector = {
  label: string
  options: SelectorOption[]
  value: string
  onChange: (value: string) => void
}

const rowsPerPageOptions = [50, 100, 150, "all"] as const
type RowsPerPage = (typeof rowsPerPageOptions)[number]

function getPermissionKey(permission: Permission) {
  return String(permission.permid)
}

function getPermissionTitle(permission: Permission) {
  return permission.permdesc ?? permission.permname ?? String(permission.permid)
}

function normalizeBoolean(value: unknown) {
  return Boolean(Number(value))
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

export function PermissionPageFlow({
  availablePermissions,
  busy,
  editableFields,
  grantedPermissions,
  loading,
  onRemove,
  onSave,
  selectors,
  submitting,
  title,
}: {
  availablePermissions: Permission[]
  busy: boolean
  editableFields: EditableField[]
  grantedPermissions: Permission[]
  loading: boolean
  onRemove: (permission: Permission) => Promise<void>
  onSave: (
    permission: Permission,
    values: PermissionEditValues,
  ) => Promise<void>
  selectors: PermissionSelector[]
  submitting: boolean
  title: string
}) {
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const [filter, setFilter] = useState("")
  const [onlyGranted, setOnlyGranted] = useState(true)
  const [rowsPerPage, setRowsPerPage] = useState<RowsPerPage>(50)
  const [page, setPage] = useState(0)
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
  const supportsSkip = editableFields.includes("permskip")
  const supportsNegated = editableFields.includes("permnegated")
  const permissionTableColumnCount =
    3 + Number(supportsSkip) + Number(supportsNegated)

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
  }, [filter, onlyGranted, rowsPerPage, selectors.map((selector) => selector.value).join(":")])

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
    setEditedSkip(normalizeBoolean(permission.permskip))
    setEditedNegated(normalizeBoolean(permission.permnegated))
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

  const saveEditingPermission = async () => {
    if (!editingPermission) {
      return
    }

    await onSave(editingPermission, {
      permnegated: editedNegated,
      permskip: editedSkip,
      permvalue: editedValue,
    })
    setEditingPermission(null)
  }

  const removeSelectedPermission = async () => {
    if (!deletePermission) {
      return
    }

    await onRemove(deletePermission)
    setDeletePermission(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 overflow-visible">
          <div
            className="grid items-start gap-3"
            style={{
              gridTemplateColumns:
                selectors.length > 1
                  ? "repeat(2, minmax(220px, 320px)) minmax(220px, 1fr) auto"
                  : "minmax(220px, 320px) minmax(220px, 1fr) auto",
            }}
          >
            {selectors.map((selector) => (
              <select
                className="flex h-9 min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                key={selector.label}
                value={selector.value}
                onChange={(event) => selector.onChange(event.target.value)}
              >
                {selector.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ))}

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
                    {supportsSkip ? (
                      <TableHead className="w-24 text-center">Skip</TableHead>
                    ) : null}
                    {supportsNegated ? (
                      <TableHead className="w-24 text-center">Negate</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPermissionList.length ? (
                    paginatedPermissionList.map((permission) => (
                      <TableRow
                        className="overflow-visible"
                        key={getPermissionKey(permission)}
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
                        <TableCell className="text-right">
                          {String(permission.permvalue ?? "")}
                        </TableCell>
                        {supportsSkip ? (
                          <TableCell>
                            <div className="flex justify-center">
                              <Checkbox
                                checked={normalizeBoolean(permission.permskip)}
                                disabled
                              />
                            </div>
                          </TableCell>
                        ) : null}
                        {supportsNegated ? (
                          <TableCell>
                            <div className="flex justify-center">
                              <Checkbox
                                checked={normalizeBoolean(
                                  permission.permnegated,
                                )}
                                disabled
                              />
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-24 text-center text-muted-foreground"
                        colSpan={permissionTableColumnCount}
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

      {editingPermission ? (
        <PermissionModal>
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>{getPermissionTitle(editingPermission)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {editableFields.includes("permvalue") ? (
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
              ) : null}

              {supportsSkip || supportsNegated ? (
                <div className="flex flex-wrap items-center gap-6">
                  {supportsSkip ? (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editedSkip}
                        disabled={submitting}
                        onCheckedChange={(checked) =>
                          setEditedSkip(checked === true)
                        }
                      />
                      Skip
                    </label>
                  ) : null}

                  {supportsNegated ? (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editedNegated}
                        disabled={submitting}
                        onCheckedChange={(checked) =>
                          setEditedNegated(checked === true)
                        }
                      />
                      Negated
                    </label>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  disabled={submitting}
                  type="button"
                  onClick={() => void saveEditingPermission()}
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
              </div>
            </CardContent>
          </Card>
        </PermissionModal>
      ) : null}

      {deletePermission ? (
        <PermissionModal>
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
              <div className="flex justify-end gap-2">
                <Button
                  disabled={submitting}
                  type="button"
                  onClick={() => void removeSelectedPermission()}
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
              </div>
            </CardContent>
          </Card>
        </PermissionModal>
      ) : null}
    </div>
  )
}

function PermissionModal({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
      {children}
    </div>
  )
}
