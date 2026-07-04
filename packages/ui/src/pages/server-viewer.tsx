import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  Ban,
  Edit,
  Hash,
  LockKeyhole,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react"

import { TeamSpeak } from "@/api/teamspeak"
import { useAuth, type QueryUser } from "@/auth/auth-context"
import { ToastStack, useToastStack } from "@/components/toast-stack"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { startLoading, stopLoading } from "@/lib/loading-progress"
import { cn } from "@/lib/utils"

type ServerInfo = {
  virtualserverName?: string
  [key: string]: unknown
}

type ChannelRow = {
  cid: string | number
  pid: string | number
  channelName: string
  channelTopic?: string
  totalClients?: string | number
  [key: string]: unknown
}

type ClientRow = {
  clid: string | number
  cid: string | number
  clientNickname: string
  clientDatabaseId?: string | number
  clientAway?: string | number
  clientAwayMessage?: string
  clientInputMuted?: string | number
  clientOutputMuted?: string | number
  [key: string]: unknown
}

type ChannelTreeItem = ChannelRow & {
  id: string
  itemId: string | number
  parentItemId: string | number
  children?: TreeItem[]
}

type ClientTreeItem = ClientRow & {
  id: string
  itemId: null
  parentItemId: string | number
}

type TreeItem = ChannelTreeItem | ClientTreeItem
const SERVER_VIEWER_CACHE_PREFIX = "ts3-manager:server-viewer:"

type ServerViewerLoadResult = {
  serverInfo: ServerInfo
  channelList: ChannelRow[]
  clientList: ClientRow[]
  queryUser?: QueryUser
}

type ServerViewerCache = {
  serverId?: string
  serverInfo: ServerInfo
  channelList: ChannelRow[]
  clientList: ClientRow[]
  queryUser?: QueryUser
  loaded: boolean
  lastLoadedAt?: number
}

const serverViewerCache: ServerViewerCache = {
  serverInfo: {},
  channelList: [],
  clientList: [],
  loaded: false,
}
const serverViewerLoadFlights = new Map<string, Promise<ServerViewerLoadResult>>()
const channelTreeLoadFlights = new Map<string, Promise<ServerViewerLoadResult>>()

function readServerViewerCache(serverId: string | undefined) {
  if (!serverId) {
    return undefined
  }

  try {
    const cachedValue = window.sessionStorage.getItem(
      SERVER_VIEWER_CACHE_PREFIX + serverId,
    )

    if (!cachedValue) {
      return undefined
    }

    const parsed = JSON.parse(cachedValue) as Partial<ServerViewerCache>

    if (!Array.isArray(parsed.channelList) || !Array.isArray(parsed.clientList)) {
      return undefined
    }

    return {
      serverId,
      serverInfo: parsed.serverInfo ?? {},
      channelList: parsed.channelList,
      clientList: parsed.clientList,
      queryUser: parsed.queryUser,
      loaded: true,
      lastLoadedAt: parsed.lastLoadedAt,
    } satisfies ServerViewerCache
  } catch {
    return undefined
  }
}

function writeServerViewerCache(cache: ServerViewerCache) {
  if (!cache.serverId) {
    return
  }

  try {
    window.sessionStorage.setItem(
      SERVER_VIEWER_CACHE_PREFIX + cache.serverId,
      JSON.stringify(cache),
    )
  } catch {
    // Ignore storage quota/privacy mode failures; in-memory cache still works.
  }
}

function getServerViewerCache(serverId: string | undefined) {
  if (serverId && serverViewerCache.loaded && serverViewerCache.serverId === serverId) {
    return serverViewerCache
  }

  const persistedCache = readServerViewerCache(serverId)

  if (persistedCache) {
    Object.assign(serverViewerCache, persistedCache)
  }

  return persistedCache
}

type SpacerAlignment = "left" | "center" | "right"

type SpacerDisplay = {
  isSpacer: boolean
  label: string
  alignment: SpacerAlignment
}

type EventPayload = Record<string, unknown>
type ProgressMode = "foreground" | "background" | "none"
type ClientActionType = "poke" | "kick-channel" | "kick-server"
type ClientAction = {
  type: ClientActionType
  client: ClientTreeItem
} | null
type DeleteChannelAction = {
  channel: ChannelTreeItem
} | null

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

function valueOrDash(value: unknown) {
  return value === undefined || value === null || value === "" ? "-" : String(value)
}

function getChannelLabel(channel: ChannelRow) {
  return formatChannelName(channel.channelName).label.trim() || channel.channelName
}

function isUsableServerId(value: string | number | undefined | null) {
  return (
    value !== undefined &&
    value !== null &&
    String(value) !== "" &&
    String(value) !== "0"
  )
}

function getEventDetail(event: Event) {
  return event instanceof CustomEvent ? event.detail : undefined
}

function isRecord(value: unknown): value is EventPayload {
  return typeof value === "object" && value !== null
}

function findPayloadValue(payload: unknown, keys: string[]): unknown {
  if (!isRecord(payload)) {
    return undefined
  }

  for (const key of keys) {
    if (payload[key] !== undefined) {
      return payload[key]
    }
  }

  for (const value of Object.values(payload)) {
    const nestedValue = findPayloadValue(value, keys)

    if (nestedValue !== undefined) {
      return nestedValue
    }
  }

  return undefined
}

function normalizeEventId(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return value
  }

  return undefined
}

function findRecordWithKeys(payload: unknown, keys: string[]): EventPayload | undefined {
  if (!isRecord(payload)) {
    return undefined
  }

  if (keys.some((key) => payload[key] !== undefined)) {
    return payload
  }

  for (const value of Object.values(payload)) {
    const nestedRecord = findRecordWithKeys(value, keys)

    if (nestedRecord) {
      return nestedRecord
    }
  }

  return undefined
}

function getMovedClientId(payload: unknown) {
  return normalizeEventId(
    findPayloadValue(payload, ["clid", "clientId", "client_id"]),
  )
}

function getTargetChannelId(payload: unknown) {
  return normalizeEventId(
    findPayloadValue(payload, ["ctid", "targetChannelId", "targetCid", "cid"]),
  )
}

function getConnectedClient(payload: unknown): ClientRow | undefined {
  const clientPayload = findRecordWithKeys(payload, ["clid", "clientId"])

  if (!clientPayload) {
    return undefined
  }

  const clid = normalizeEventId(
    findPayloadValue(clientPayload, ["clid", "clientId", "client_id"]),
  )
  const cid = getTargetChannelId(clientPayload)

  if (clid === undefined || cid === undefined) {
    return undefined
  }

  const nickname = findPayloadValue(clientPayload, [
    "clientNickname",
    "nickname",
    "client_nickname",
  ])
  const clientDatabaseId = normalizeEventId(
    findPayloadValue(clientPayload, [
      "clientDatabaseId",
      "clientDbid",
      "clientDatabaseID",
      "client_database_id",
    ]),
  )

  return {
    ...clientPayload,
    clid,
    cid,
    clientNickname:
      typeof nickname === "string" && nickname ? nickname : "Client " + String(clid),
    clientDatabaseId,
  }
}

function createNestedList(
  list: TreeItem[],
  itemId: string | number = 0,
): TreeItem[] {
  return list
    .filter((item) => String(item.parentItemId) === String(itemId))
    .map((item) => {
      if (item.itemId === null) {
        return item
      }

      const children = createNestedList(list, item.itemId)

      return children.length ? { ...item, children } : item
    })
}

function mergeTreeItems(clients: ClientRow[], channels: ChannelRow[]): TreeItem[] {
  return [
    ...clients.map((client) => ({
      ...client,
      id: String(client.clid) + "-client",
      itemId: null,
      parentItemId: client.cid,
    })),
    ...channels.map((channel) => ({
      ...channel,
      id: String(channel.cid) + "-channel",
      itemId: channel.cid,
      parentItemId: channel.pid,
    })),
  ]
}

function isClientTreeItem(item: TreeItem): item is ClientTreeItem {
  return item.itemId === null
}

function formatChannelName(channelName: string): SpacerDisplay {
  const match = channelName.match(
    /^\[(\*)?(cspacer|rspacer|lspacer|spacer)\d*\]\s*(.*)$/i,
  )

  if (!match) {
    return {
      isSpacer: false,
      label: channelName,
      alignment: "left",
    }
  }

  const hasStar = match[1] === "*"
  const spacerType = match[2].toLowerCase()
  const label = match[3].trim() || " "

  return {
    isSpacer: true,
    label,
    alignment:
      spacerType === "cspacer"
        ? hasStar
          ? "left"
          : "center"
        : spacerType === "rspacer"
          ? "right"
          : "left",
  }
}

function ChannelActions({
  channel,
  children,
  onDeleteChannel,
  onSwitchChannel,
}: {
  channel: ChannelTreeItem
  children: ReactNode
  onDeleteChannel: (channel: ChannelTreeItem) => void
  onSwitchChannel: (channel: ChannelTreeItem) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onSwitchChannel(channel)}>
          <ArrowRight className="size-4" />
          Switch to Channel
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={"/chat/" + String(channel.cid)}>
            <MessageSquare className="size-4" />
            Open Text Chat
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={"/channel/" + String(channel.cid) + "/edit?pid=" + String(channel.pid)}>
            <Edit className="size-4" />
            Edit Channel
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={"/permissions/channel/" + String(channel.cid)}>
            <LockKeyhole className="size-4" />
            Channel Permissions
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={"/channel/add?pid=" + String(channel.cid)}>
            <Plus className="size-4" />
            Create Sub-Channel
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDeleteChannel(channel)}
        >
          <Trash2 className="size-4" />
          Delete Channel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ClientActions({
  client,
  children,
  onClientAction,
}: {
  client: ClientTreeItem
  children: ReactNode
  onClientAction: (type: ClientActionType, client: ClientTreeItem) => void
}) {
  const clientDbId = client.clientDatabaseId

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={() => onClientAction("poke", client)}>
          <Zap className="size-4" />
          Poke Client
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link to={"/chat?client=" + String(client.clid)}>
            <MessageSquare className="size-4" />
            Open Text Chat
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link to={"/client/" + String(client.clid) + "/edit"}>
            <Edit className="size-4" />
            Edit Client
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => onClientAction("kick-channel", client)}>
          <ArrowRight className="size-4" />
          Kick Client from Channel
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => onClientAction("kick-server", client)}>
          <ArrowRight className="size-4" />
          Kick Client from Server
        </DropdownMenuItem>

        {clientDbId !== undefined && clientDbId !== null ? (
        <DropdownMenuItem asChild>
          <Link
            className="text-destructive focus:text-destructive"
            to={"/client/" + String(clientDbId) + "/ban"}
          >
            <Ban className="size-4" />
            Ban Client
          </Link>
        </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <Ban className="size-4" />
            Ban Client
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ChannelTreeItem({
  item,
  depth = 0,
  onClientAction,
  onDeleteChannel,
  onSwitchChannel,
}: {
  item: TreeItem
  depth?: number
  onClientAction: (type: ClientActionType, client: ClientTreeItem) => void
  onDeleteChannel: (channel: ChannelTreeItem) => void
  onSwitchChannel: (channel: ChannelTreeItem) => void
}) {
  const paddingLeft = String(depth * 18 + 8) + "px"

  if (isClientTreeItem(item)) {
    const away = item.clientAway === "1" || item.clientAway === 1

    return (
      <ClientActions client={item} onClientAction={onClientAction}>
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none"
          style={{ paddingLeft }}
          type="button"
        >
          <UserRound className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{item.clientNickname}</span>
          {away ? <Badge variant="outline">away</Badge> : null}
        </button>
      </ClientActions>
    )
  }

  const channelDisplay = formatChannelName(item.channelName)

  return (
    <div>
      <ChannelActions
        channel={item}
        onDeleteChannel={onDeleteChannel}
        onSwitchChannel={onSwitchChannel}
      >
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none"
          style={{ paddingLeft }}
          type="button"
        >
          {channelDisplay.isSpacer ? (
            <span className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Hash className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              channelDisplay.alignment === "center" && "text-center",
              channelDisplay.alignment === "right" && "text-right",
            )}
          >
            {channelDisplay.label}
          </span>
        </button>
      </ChannelActions>
      {item.children?.map((child) => (
        <ChannelTreeItem
          depth={depth + 1}
          item={child}
          key={child.id}
          onClientAction={onClientAction}
          onDeleteChannel={onDeleteChannel}
          onSwitchChannel={onSwitchChannel}
        />
      ))}
    </div>
  )
}

export function ServerViewerPage() {
  const { queryUser, saveQueryUser, saveServerId, serverId } = useAuth()
  const selectedServerId = useMemo(() => {
    if (isUsableServerId(queryUser.virtualserverId)) {
      return queryUser.virtualserverId
    }

    if (isUsableServerId(serverId)) {
      return serverId
    }

    return undefined
  }, [queryUser.virtualserverId, serverId])

  const reloadTimerRef = useRef<number | null>(null)
  const reloadInFlightRef = useRef(false)
  const reloadQueuedRef = useRef(false)
  const queryUserRef = useRef(queryUser)
  const { dismissToast, showError, toasts } = useToastStack()
  const selectedServerKey = isUsableServerId(selectedServerId)
    ? String(selectedServerId)
    : undefined
  const initialCache = getServerViewerCache(selectedServerKey)
  const [serverInfo, setServerInfo] = useState<ServerInfo>(
    () => initialCache?.serverInfo ?? {},
  )
  const [channelList, setChannelList] = useState<ChannelRow[]>(
    () => initialCache?.channelList ?? [],
  )
  const [clientList, setClientList] = useState<ClientRow[]>(
    () => initialCache?.clientList ?? [],
  )
  const [loading, setLoading] = useState(() => !initialCache?.loaded)
  const [clientAction, setClientAction] = useState<ClientAction>(null)
  const [clientActionMessage, setClientActionMessage] = useState("")
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [deleteChannelAction, setDeleteChannelAction] =
    useState<DeleteChannelAction>(null)
  const [forceChannelDelete, setForceChannelDelete] = useState(false)

  const hasMatchingCache = Boolean(
    selectedServerKey &&
      serverViewerCache.loaded &&
      serverViewerCache.serverId === selectedServerKey,
  )

  const channelTree = useMemo(
    () => createNestedList(mergeTreeItems(clientList, channelList)),
    [channelList, clientList],
  )

  useEffect(() => {
    queryUserRef.current = queryUser
  }, [queryUser])

  const setError = useCallback(
    (message: string | null) => {
      showError(message)
    },
    [showError],
  )

  const loadQueryUser = useCallback(async () => {
    const userInfo = await TeamSpeak.execute<QueryUser[]>(
      "whoami",
      {},
      [],
      { progress: "background" },
    )
    const nextQueryUser = userInfo[0] ?? {}

    saveQueryUser(nextQueryUser)

    return nextQueryUser
  }, [saveQueryUser])

  const ensureSelectedServer = useCallback(async (
    progress: "foreground" | "background" | "none" = "foreground",
  ) => {
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

    const nextQueryUser = await TeamSpeak.selectServer(validSelectedServerId, {
      progress,
    })

    saveServerId(validSelectedServerId)

    if (nextQueryUser) {
      saveQueryUser(nextQueryUser)
    }

    return nextQueryUser
  }, [saveQueryUser, saveServerId, selectedServerId])

  const loadChannelTree = useCallback(
    async (
      options: {
        ensureSelection?: boolean
        queryUser?: QueryUser
        progress?: "foreground" | "background" | "none"
      } = {},
    ) => {
      if (!selectedServerKey) {
        throw new Error("No valid virtual server selected.")
      }

      const existingFlight = channelTreeLoadFlights.get(selectedServerKey)

      if (existingFlight) {
        const result = await existingFlight

        setChannelList(result.channelList)
        setClientList(result.clientList)

        if (result.queryUser) {
          saveQueryUser(result.queryUser)
        }

        return result.queryUser ?? {}
      }

      const flight = (async () => {
        let selectedQueryUser = options.queryUser

        if (options.ensureSelection !== false) {
          selectedQueryUser = await ensureSelectedServer(
            options.progress ?? "background",
          )
        }

        const [nextChannels, nextClients] = await Promise.all([
          TeamSpeak.execute<ChannelRow[]>("channellist", {}, [], {
            progress: options.progress ?? "background",
          }),
          TeamSpeak.execute<ClientRow[]>("clientlist", {}, ["-voice", "-away"], {
            progress: options.progress ?? "background",
          }),
        ])

        const nextQueryUser = selectedQueryUser ?? (await loadQueryUser())

        serverViewerCache.serverId = selectedServerKey
        serverViewerCache.channelList = nextChannels
        serverViewerCache.clientList = nextClients
        serverViewerCache.queryUser = nextQueryUser
        serverViewerCache.loaded = true
        serverViewerCache.lastLoadedAt = Date.now()
        writeServerViewerCache(serverViewerCache)

        return {
          serverInfo: serverViewerCache.serverInfo,
          channelList: nextChannels,
          clientList: nextClients,
          queryUser: nextQueryUser,
        }
      })().finally(() => {
        channelTreeLoadFlights.delete(selectedServerKey)
      })

      channelTreeLoadFlights.set(selectedServerKey, flight)

      const result = await flight

      setChannelList(result.channelList)
      setClientList(result.clientList)

      if (result.queryUser) {
        saveQueryUser(result.queryUser)
      }

      return result.queryUser ?? {}
    },
    [ensureSelectedServer, loadQueryUser, saveQueryUser, selectedServerKey],
  )

  const scheduleChannelTreeReload = useCallback(() => {
    if (reloadTimerRef.current !== null) {
      window.clearTimeout(reloadTimerRef.current)
    }

    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = null

      if (reloadInFlightRef.current) {
        reloadQueuedRef.current = true
        return
      }

      reloadInFlightRef.current = true
      void loadChannelTree()
        .catch((treeError: unknown) => {
          setError(getErrorMessage(treeError))
        })
        .finally(() => {
          reloadInFlightRef.current = false

          if (reloadQueuedRef.current) {
            reloadQueuedRef.current = false
            scheduleChannelTreeReload()
          }
        })
    }, 250)
  }, [loadChannelTree])

  const loadServerViewer = useCallback(async (
    options: { foreground?: boolean } = {},
  ) => {
    if (!isUsableServerId(selectedServerId)) {
      setServerInfo({})
      setChannelList([])
      setClientList([])
      setError(null)
      setLoading(false)
      return
    }

    const currentCache = getServerViewerCache(selectedServerKey)
    const canUseCache = Boolean(currentCache?.loaded)

    if (currentCache?.loaded) {
      setServerInfo(currentCache.serverInfo)
      setChannelList(currentCache.channelList)
      setClientList(currentCache.clientList)

      if (currentCache.queryUser) {
        saveQueryUser(currentCache.queryUser)
      }
    } else {
      setServerInfo({})
      setChannelList([])
      setClientList([])
    }

    setLoading(Boolean(options.foreground) || !canUseCache)
    setError(null)

    try {
      if (!selectedServerKey) {
        throw new Error("No valid virtual server selected.")
      }

      let flight = serverViewerLoadFlights.get(selectedServerKey)
      const hadExistingFlight = Boolean(flight)

      if (!flight) {
        flight = (async () => {
          const progress: ProgressMode =
            options.foreground || !canUseCache ? "foreground" : "background"
          const selectedQueryUser = await ensureSelectedServer(progress)

          const [info, nextChannels, nextClients] = await Promise.all([
            TeamSpeak.execute<ServerInfo[]>("serverinfo", {}, [], { progress }),
            TeamSpeak.execute<ChannelRow[]>("channellist", {}, [], { progress }),
            TeamSpeak.execute<ClientRow[]>("clientlist", {}, ["-voice", "-away"], {
              progress,
            }),
          ])

          const nextServerInfo = info[0] ?? {}

          serverViewerCache.serverId = selectedServerKey
          serverViewerCache.serverInfo = nextServerInfo
          serverViewerCache.channelList = nextChannels
          serverViewerCache.clientList = nextClients
          serverViewerCache.queryUser = selectedQueryUser
          serverViewerCache.loaded = true
          serverViewerCache.lastLoadedAt = Date.now()
          writeServerViewerCache(serverViewerCache)

          return {
            serverInfo: nextServerInfo,
            channelList: nextChannels,
            clientList: nextClients,
            queryUser: selectedQueryUser,
          }
        })().finally(() => {
          serverViewerLoadFlights.delete(selectedServerKey)
        })

        serverViewerLoadFlights.set(selectedServerKey, flight)
      }

      let wrappedExistingForeground = false

      if (options.foreground && hadExistingFlight) {
        startLoading()
        wrappedExistingForeground = true
      }

      const result = await flight.finally(() => {
        if (wrappedExistingForeground) {
          stopLoading()
        }
      })

      setServerInfo(result.serverInfo)
      setChannelList(result.channelList)
      setClientList(result.clientList)

      if (result.queryUser) {
        saveQueryUser(result.queryUser)
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [ensureSelectedServer, saveQueryUser, selectedServerId, selectedServerKey])

  const moveClientLocally = useCallback(
    (clientId: string | number, channelId: string | number) => {
      setClientList((currentClients) => {
        const nextClients = currentClients.map((client) =>
          String(client.clid) === String(clientId)
            ? { ...client, cid: channelId }
            : client,
        )

        if (selectedServerKey && serverViewerCache.serverId === selectedServerKey) {
          serverViewerCache.clientList = nextClients
          writeServerViewerCache(serverViewerCache)
        }

        return nextClients
      })

      if (String(queryUser.clientId ?? "") === String(clientId)) {
        saveQueryUser({
          ...queryUser,
          clientChannelId: channelId,
        })
      }
    },
    [queryUser, saveQueryUser, selectedServerKey],
  )

  const removeClientLocally = useCallback(
    (clientId: string | number) => {
      setClientList((currentClients) => {
        const nextClients = currentClients.filter(
          (client) => String(client.clid) !== String(clientId),
        )

        if (selectedServerKey && serverViewerCache.serverId === selectedServerKey) {
          serverViewerCache.clientList = nextClients
          writeServerViewerCache(serverViewerCache)
        }

        return nextClients
      })
    },
    [selectedServerKey],
  )

  const removeChannelLocally = useCallback(
    (channelId: string | number) => {
      setChannelList((currentChannels) => {
        const nextChannels = currentChannels.filter(
          (channel) => String(channel.cid) !== String(channelId),
        )

        if (selectedServerKey && serverViewerCache.serverId === selectedServerKey) {
          serverViewerCache.channelList = nextChannels
          writeServerViewerCache(serverViewerCache)
        }

        return nextChannels
      })

      setClientList((currentClients) => {
        const nextClients = currentClients.filter(
          (client) => String(client.cid) !== String(channelId),
        )

        if (selectedServerKey && serverViewerCache.serverId === selectedServerKey) {
          serverViewerCache.clientList = nextClients
          writeServerViewerCache(serverViewerCache)
        }

        return nextClients
      })
    },
    [selectedServerKey],
  )

  const openClientAction = (type: ClientActionType, client: ClientTreeItem) => {
    setClientAction({ type, client })
    setClientActionMessage("")
    setDialogError(null)
    setError(null)
  }

  const closeClientAction = () => {
    if (actionBusy) {
      return
    }

    setClientAction(null)
    setDialogError(null)
  }

  const submitClientAction = async () => {
    if (!clientAction) {
      return
    }

    setActionBusy(true)
    setDialogError(null)
    setError(null)

    try {
      await ensureSelectedServer()

      if (clientAction.type === "poke") {
        await TeamSpeak.execute("clientpoke", {
          clid: clientAction.client.clid,
          msg: clientActionMessage,
        })
      }

      if (clientAction.type === "kick-channel") {
        await TeamSpeak.execute("clientkick", {
          clid: clientAction.client.clid,
          reasonid: 4,
          reasonmsg: clientActionMessage,
        })
        scheduleChannelTreeReload()
      }

      if (clientAction.type === "kick-server") {
        await TeamSpeak.execute("clientkick", {
          clid: clientAction.client.clid,
          reasonid: 5,
          reasonmsg: clientActionMessage,
        })
        removeClientLocally(clientAction.client.clid)
        scheduleChannelTreeReload()
      }

      setClientAction(null)
    } catch (actionError) {
      setClientAction(null)
      setError(getErrorMessage(actionError))
    } finally {
      setActionBusy(false)
    }
  }

  const handleSwitchChannel = async (channel: ChannelTreeItem) => {
    setError(null)

    const currentClientId = normalizeEventId(queryUser.clientId)

    if (currentClientId) {
      moveClientLocally(currentClientId, channel.cid)
    }

    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("clientmove", {
        clid: queryUser.clientId,
        cid: channel.cid,
      })
      scheduleChannelTreeReload()
    } catch (switchError) {
      setError(getErrorMessage(switchError))
      scheduleChannelTreeReload()
    }
  }

  const openDeleteChannel = (channel: ChannelTreeItem) => {
    setDeleteChannelAction({ channel })
    setForceChannelDelete(false)
    setDialogError(null)
    setError(null)
  }

  const closeDeleteChannel = () => {
    if (actionBusy) {
      return
    }

    setDeleteChannelAction(null)
    setDialogError(null)
  }

  const confirmDeleteChannel = async () => {
    if (!deleteChannelAction) {
      return
    }

    setActionBusy(true)
    setDialogError(null)

    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("channeldelete", {
        cid: deleteChannelAction.channel.cid,
        force: forceChannelDelete ? 1 : 0,
      })
      removeChannelLocally(deleteChannelAction.channel.cid)
      scheduleChannelTreeReload()
      setDeleteChannelAction(null)
    } catch (deleteError) {
      setDialogError(getErrorMessage(deleteError))
    } finally {
      setActionBusy(false)
    }
  }

  useEffect(() => {
    void loadServerViewer()
  }, [loadServerViewer])

  useEffect(() => {
    if (!isUsableServerId(selectedServerId)) {
      return
    }

    const addClientLocally = (client: ClientRow) => {
      setClientList((currentClients) => {
        const withoutDuplicate = currentClients.filter(
          (currentClient) => String(currentClient.clid) !== String(client.clid),
        )
        const nextClients = [...withoutDuplicate, client]

        if (selectedServerKey && serverViewerCache.serverId === selectedServerKey) {
          serverViewerCache.clientList = nextClients
          writeServerViewerCache(serverViewerCache)
        }

        return nextClients
      })
    }

    const removeClientLocally = (clientId: string | number) => {
      setClientList((currentClients) => {
        const nextClients = currentClients.filter(
          (client) => String(client.clid) !== String(clientId),
        )

        if (selectedServerKey && serverViewerCache.serverId === selectedServerKey) {
          serverViewerCache.clientList = nextClients
          writeServerViewerCache(serverViewerCache)
        }

        return nextClients
      })
    }

    const handleClientMoved: EventListener = (event) => {
      const payload = getEventDetail(event)
      const movedClientId = getMovedClientId(payload)
      const targetChannelId = getTargetChannelId(payload)

      if (movedClientId !== undefined && targetChannelId !== undefined) {
        moveClientLocally(movedClientId, targetChannelId)
      }

      scheduleChannelTreeReload()
    }

    const handleClientConnect: EventListener = (event) => {
      const connectedClient = getConnectedClient(getEventDetail(event))

      if (connectedClient) {
        addClientLocally(connectedClient)
      }

      scheduleChannelTreeReload()
    }

    const handleClientDisconnect: EventListener = (event) => {
      const disconnectedClientId = getMovedClientId(getEventDetail(event))

      if (disconnectedClientId !== undefined) {
        removeClientLocally(disconnectedClientId)
      }

      scheduleChannelTreeReload()
    }

    const handleTreeEvent: EventListener = () => {
      scheduleChannelTreeReload()
    }

    TeamSpeak.on("clientmoved", handleClientMoved)
    TeamSpeak.on("clientconnect", handleClientConnect)
    TeamSpeak.on("clientdisconnect", handleClientDisconnect)
    TeamSpeak.on("channelcreate", handleTreeEvent)
    TeamSpeak.on("channeledit", handleTreeEvent)
    TeamSpeak.on("channelmoved", handleTreeEvent)
    TeamSpeak.on("channeldelete", handleTreeEvent)

    return () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }

      TeamSpeak.off("clientmoved", handleClientMoved)
      TeamSpeak.off("clientconnect", handleClientConnect)
      TeamSpeak.off("clientdisconnect", handleClientDisconnect)
      TeamSpeak.off("channelcreate", handleTreeEvent)
      TeamSpeak.off("channeledit", handleTreeEvent)
      TeamSpeak.off("channelmoved", handleTreeEvent)
      TeamSpeak.off("channeldelete", handleTreeEvent)
    }
  }, [moveClientLocally, scheduleChannelTreeReload, selectedServerId, selectedServerKey])

  const clientActionTitle =
    clientAction?.type === "poke"
      ? "Poke"
      : clientAction?.type === "kick-channel"
        ? "Kick from Channel"
        : "Kick from Server"
  const clientActionMessageLabel =
    clientAction?.type === "poke" ? "Poke Message" : "Kick Message"
  const clientActionSubmitLabel = clientAction?.type === "poke" ? "Send" : "OK"

  if (!isUsableServerId(selectedServerId)) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-xl items-center justify-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>No server selected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select an online virtual server from Server List first.
            </p>
            <Button asChild>
              <Link to="/servers">Go to Server List</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="truncate">
              {valueOrDash(serverInfo.virtualserverName)}
            </CardTitle>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/channel/add">
                <Plus className="size-4" />
                Add Channel
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/spacer/add">
                <Plus className="size-4" />
                Add Spacer
              </Link>
            </Button>
            <Button
              disabled={loading}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void loadServerViewer({ foreground: true })}
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !hasMatchingCache && channelTree.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Loading server viewer...
            </div>
          ) : channelTree.length ? (
            <div className="space-y-0.5 rounded-lg border p-2">
              {channelTree.map((item) => (
                <ChannelTreeItem
                  item={item}
                  key={item.id}
                  onClientAction={openClientAction}
                  onDeleteChannel={openDeleteChannel}
                  onSwitchChannel={(channel) => void handleSwitchChannel(channel)}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              No channels or clients found.
            </div>
          )}
        </CardContent>
      </Card>

      {clientAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
              <CardTitle>{clientActionTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client-action-message">
                  {clientActionMessageLabel}
                </Label>
                <Input
                  disabled={actionBusy}
                  id="client-action-message"
                  value={clientActionMessage}
                  onChange={(event) => setClientActionMessage(event.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  disabled={actionBusy}
                  type="button"
                  variant="outline"
                  onClick={closeClientAction}
                >
                  Cancel
                </Button>
                <Button
                  disabled={actionBusy}
                  type="button"
                  onClick={() => void submitClientAction()}
                >
                  {actionBusy ? "Working..." : clientActionSubmitLabel}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {deleteChannelAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader>
              <CardTitle>Delete Channel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Do you really want to delete this channel?
              </p>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                {getChannelLabel(deleteChannelAction.channel)}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={forceChannelDelete}
                  className="size-4 accent-primary"
                  disabled={actionBusy}
                  type="checkbox"
                  onChange={(event) => setForceChannelDelete(event.target.checked)}
                />
                Delete even if there are clients in the channel
              </label>
              {dialogError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {dialogError}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  disabled={actionBusy}
                  type="button"
                  variant="outline"
                  onClick={closeDeleteChannel}
                >
                  Cancel
                </Button>
                <Button
                  disabled={actionBusy}
                  type="button"
                  variant="destructive"
                  onClick={() => void confirmDeleteChannel()}
                >
                  {actionBusy ? "Working..." : "Delete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

    </div>
  )
}
