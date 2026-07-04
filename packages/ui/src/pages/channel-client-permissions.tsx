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

type ChannelRow = {
  cid: string | number
  channelName: string
  [key: string]: unknown
}

type ClientDbRow = {
  cldbid: string | number
  clientNickname: string
  [key: string]: unknown
}

type ChannelClientPermissionsData = {
  availablePermissions: Permission[]
  channels: ChannelRow[]
  clients: ClientDbRow[]
}

const globalCache = new Map<string, ChannelClientPermissionsData>()
const globalFlights = new Map<string, Promise<ChannelClientPermissionsData>>()
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

async function fullClientDBList() {
  const fullClientDbList: ClientDbRow[] = []
  let start = 0
  const duration = 200

  while (true) {
    const clients = await TeamSpeak.execute<ClientDbRow[]>("clientdblist", {
      start,
      duration,
    })

    if (!clients.length) break

    fullClientDbList.push(...clients)
    start += duration
  }

  return fullClientDbList
}

export function ChannelClientPermissions() {
  const navigate = useNavigate()
  const { cid, cldbid } = useParams()
  const { queryUser, saveQueryUser, saveServerId, serverId } = useAuth()
  const queryUserRef = useRef(queryUser)
  const { dismissToast, showError, toasts } = useToastStack()
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([])
  const [grantedPermissions, setGrantedPermissions] = useState<Permission[]>([])
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [clients, setClients] = useState<ClientDbRow[]>([])
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
        TeamSpeak.execute<ChannelRow[]>("channellist"),
        fullClientDBList(),
      ])
        .then(([availablePermissions, channels, clients]) => {
          const data = { availablePermissions, channels, clients }
          globalCache.set(serverCacheKey, data)
          return data
        })
        .finally(() => globalFlights.delete(serverCacheKey))

      globalFlights.set(serverCacheKey, flight)
    }

    return flight
  }, [ensureSelectedServer, serverCacheKey])

  const getPermissions = useCallback(
    async (channelId: string | number, clientDbId: string | number) => {
      const key =
        serverCacheKey +
        ":channelclient:" +
        String(channelId) +
        ":" +
        String(clientDbId)
      const cached = permissionCache.get(key)
      if (cached) return cached

      let flight = permissionFlights.get(key)
      if (!flight) {
        flight = TeamSpeak.execute<Permission[]>("channelclientpermlist", {
          cid: channelId,
          cldbid: clientDbId,
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
    async (channelId: string | number, clientDbId: string | number) => {
      const key =
        serverCacheKey +
        ":channelclient:" +
        String(channelId) +
        ":" +
        String(clientDbId)
      permissionCache.delete(key)
      permissionFlights.delete(key)
      const permissions = await TeamSpeak.execute<Permission[]>(
        "channelclientpermlist",
        { cid: channelId, cldbid: clientDbId },
      )
      permissionCache.set(key, permissions)
      return permissions
    },
    [serverCacheKey],
  )

  useEffect(() => {
    let active = true
    setInitialLoading(
      availablePermissions.length === 0 ||
        channels.length === 0 ||
        clients.length === 0,
    )

    loadGlobalData()
      .then((data) => {
        if (!active) return
        setAvailablePermissions(data.availablePermissions)
        setChannels(data.channels)
        setClients(data.clients)
        if ((!cid || !cldbid) && data.channels[0] && data.clients[0]) {
          navigate(
            "/permissions/channel/" +
              String(data.channels[0].cid) +
              "/client/" +
              String(data.clients[0].cldbid),
            { replace: true },
          )
        }
      })
      .catch((error: unknown) => active && showError(getErrorMessage(error)))
      .finally(() => active && setInitialLoading(false))

    return () => {
      active = false
    }
  }, [availablePermissions.length, channels.length, cid, cldbid, clients.length, loadGlobalData, navigate, showError])

  useEffect(() => {
    if (!cid || !cldbid) return
    let active = true
    const key =
      serverCacheKey + ":channelclient:" + String(cid) + ":" + String(cldbid)
    const cached = permissionCache.get(key)
    if (cached) {
      setGrantedPermissions(cached)
      setEntityLoading(false)
      return () => {
        active = false
      }
    }

    setEntityLoading(true)
    getPermissions(cid, cldbid)
      .then((permissions) => active && setGrantedPermissions(permissions))
      .catch((error: unknown) => active && showError(getErrorMessage(error)))
      .finally(() => active && setEntityLoading(false))

    return () => {
      active = false
    }
  }, [cid, cldbid, getPermissions, serverCacheKey, showError])

  const navigatePair = (nextCid: string, nextCldbId: string) => {
    navigate("/permissions/channel/" + nextCid + "/client/" + nextCldbId)
  }

  const savePermission = async (
    permission: Permission,
    values: PermissionEditValues,
  ) => {
    if (!cid || !cldbid) return
    setSubmitting(true)
    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("channelclientaddperm", {
        cid,
        cldbid,
        permid: permission.permid,
        permvalue: Number(values.permvalue),
      })
      setGrantedPermissions(await refreshPermissions(cid, cldbid))
    } catch (error) {
      showError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const removePermission = async (permission: Permission) => {
    if (!cid || !cldbid) return
    setSubmitting(true)
    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("channelclientdelperm", {
        cid,
        cldbid,
        permid: permission.permid,
      })
      setGrantedPermissions(await refreshPermissions(cid, cldbid))
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
            label: "Channel",
            options: channels.map((channel) => ({
              label: channel.channelName,
              value: String(channel.cid),
            })),
            value: cid ?? "",
            onChange: (value) =>
              navigatePair(value, cldbid ?? String(clients[0]?.cldbid ?? "")),
          },
          {
            label: "Client",
            options: clients.map((client) => ({
              label: client.clientNickname,
              value: String(client.cldbid),
            })),
            value: cldbid ?? "",
            onChange: (value) =>
              navigatePair(cid ?? String(channels[0]?.cid ?? ""), value),
          },
        ]}
        submitting={submitting}
        title="Channel Client Permissions"
        onRemove={removePermission}
        onSave={savePermission}
      />
    </>
  )
}
