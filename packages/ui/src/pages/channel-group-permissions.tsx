import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { TeamSpeak } from "@/api/teamspeak"
import { useAuth } from "@/auth/auth-context"
import {
  PermissionPageFlow,
  type Permission,
  type PermissionEditValues,
} from "@/components/permission-page-flow"
import { ToastStack, useToastStack } from "@/components/toast-stack"

type ChannelGroup = {
  cgid: string | number
  name: string
  type: string | number
  [key: string]: unknown
}

type ChannelGroupPermissionsData = {
  availablePermissions: Permission[]
  groups: ChannelGroup[]
}

const globalCache = new Map<string, ChannelGroupPermissionsData>()
const globalFlights = new Map<string, Promise<ChannelGroupPermissionsData>>()
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

export function ChannelGroupPermissions() {
  const navigate = useNavigate()
  const { cgid } = useParams()
  const { queryUser, saveQueryUser, saveServerId, serverId } = useAuth()
  const queryUserRef = useRef(queryUser)
  const { dismissToast, showError, toasts } = useToastStack()
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([])
  const [grantedPermissions, setGrantedPermissions] = useState<Permission[]>([])
  const [groups, setGroups] = useState<ChannelGroup[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [entityLoading, setEntityLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    queryUserRef.current = queryUser
  }, [queryUser])

  const selectedServerId = useMemo(() => {
    if (isUsableServerId(queryUser.virtualserverId)) return queryUser.virtualserverId
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

    const nextQueryUser = await TeamSpeak.selectServer(validSelectedServerId)
    saveServerId(validSelectedServerId)
    if (nextQueryUser) saveQueryUser(nextQueryUser)
    return nextQueryUser
  }, [saveQueryUser, saveServerId, selectedServerId])

  const serverCacheKey = selectedServerId ? String(selectedServerId) : "__unknown__"

  const loadGlobalData = useCallback(async () => {
    await ensureSelectedServer()
    const cached = globalCache.get(serverCacheKey)
    if (cached) return cached

    let flight = globalFlights.get(serverCacheKey)
    if (!flight) {
      flight = Promise.all([
        TeamSpeak.execute<Permission[]>("permissionlist"),
        TeamSpeak.execute<ChannelGroup[]>("channelgrouplist"),
      ])
        .then(([availablePermissions, groups]) => {
          const data = { availablePermissions, groups }
          globalCache.set(serverCacheKey, data)
          return data
        })
        .finally(() => globalFlights.delete(serverCacheKey))

      globalFlights.set(serverCacheKey, flight)
    }

    return flight
  }, [ensureSelectedServer, serverCacheKey])

  const getPermissions = useCallback(
    async (groupId: string | number) => {
      const key = serverCacheKey + ":channelgroup:" + String(groupId)
      const cached = permissionCache.get(key)
      if (cached) return cached

      let flight = permissionFlights.get(key)
      if (!flight) {
        flight = TeamSpeak.execute<Permission[]>("channelgrouppermlist", {
          cgid: groupId,
        })
          .then((permissions) => {
            permissionCache.set(key, permissions)
            return permissions
          })
          .finally(() => permissionFlights.delete(key))

        permissionFlights.set(key, flight)
      }

      return flight
    },
    [serverCacheKey],
  )

  const refreshPermissions = useCallback(
    async (groupId: string | number) => {
      const key = serverCacheKey + ":channelgroup:" + String(groupId)
      permissionCache.delete(key)
      permissionFlights.delete(key)
      const permissions = await TeamSpeak.execute<Permission[]>(
        "channelgrouppermlist",
        { cgid: groupId },
      )
      permissionCache.set(key, permissions)
      return permissions
    },
    [serverCacheKey],
  )

  useEffect(() => {
    let active = true
    setInitialLoading(availablePermissions.length === 0 || groups.length === 0)

    loadGlobalData()
      .then((data) => {
        if (!active) return
        setAvailablePermissions(data.availablePermissions)
        setGroups(data.groups)
        if (!cgid && data.groups[0]) {
          navigate("/permissions/channelgroup/" + String(data.groups[0].cgid), {
            replace: true,
          })
        }
      })
      .catch((error: unknown) => active && showError(getErrorMessage(error)))
      .finally(() => active && setInitialLoading(false))

    return () => {
      active = false
    }
  }, [availablePermissions.length, cgid, groups.length, loadGlobalData, navigate, showError])

  useEffect(() => {
    if (!cgid) return
    let active = true
    const key = serverCacheKey + ":channelgroup:" + String(cgid)
    const cached = permissionCache.get(key)
    if (cached) {
      setGrantedPermissions(cached)
      setEntityLoading(false)
      return () => {
        active = false
      }
    }

    setEntityLoading(true)
    getPermissions(cgid)
      .then((permissions) => active && setGrantedPermissions(permissions))
      .catch((error: unknown) => active && showError(getErrorMessage(error)))
      .finally(() => active && setEntityLoading(false))

    return () => {
      active = false
    }
  }, [cgid, getPermissions, serverCacheKey, showError])

  const savePermission = async (
    permission: Permission,
    values: PermissionEditValues,
  ) => {
    if (!cgid) return
    setSubmitting(true)
    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("channelgroupaddperm", {
        cgid,
        permid: permission.permid,
        permvalue: Number(values.permvalue),
      })
      setGrantedPermissions(await refreshPermissions(cgid))
    } catch (error) {
      showError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const removePermission = async (permission: Permission) => {
    if (!cgid) return
    setSubmitting(true)
    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("channelgroupdelperm", {
        cgid,
        permid: permission.permid,
      })
      setGrantedPermissions(await refreshPermissions(cgid))
    } catch (error) {
      showError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <PermissionPageFlow
        availablePermissions={availablePermissions}
        busy={initialLoading || entityLoading || submitting}
        editableFields={["permvalue"]}
        grantedPermissions={grantedPermissions}
        loading={initialLoading && availablePermissions.length === 0}
        selectors={[
          {
            label: "Channel Group",
            options: groups.map((group) => ({
              label: `${group.name} (${group.cgid})`,
              value: String(group.cgid),
            })),
            value: cgid ?? "",
            onChange: (value) => navigate("/permissions/channelgroup/" + value),
          },
        ]}
        submitting={submitting}
        title="Channel Group Permissions"
        onRemove={removePermission}
        onSave={savePermission}
      />
    </>
  )
}
