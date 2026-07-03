import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

type SpacerAlignment = "left" | "center" | "right"

type SpacerDisplay = {
  isSpacer: boolean
  label: string
  alignment: SpacerAlignment
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

function valueOrDash(value: unknown) {
  return value === undefined || value === null || value === "" ? "-" : String(value)
}

function isUsableServerId(value: string | number | undefined | null) {
  return (
    value !== undefined &&
    value !== null &&
    String(value) !== "" &&
    String(value) !== "0"
  )
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
}: {
  client: ClientTreeItem
  children: ReactNode
}) {
  const clientDbId = client.clientDatabaseId ?? client.clid

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem>
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

        <DropdownMenuItem>
          <ArrowRight className="size-4" />
          Kick Client from Channel
        </DropdownMenuItem>

        <DropdownMenuItem>
          <ArrowRight className="size-4" />
          Kick Client from Server
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            className="text-destructive focus:text-destructive"
            to={"/client/" + String(clientDbId) + "/ban"}
          >
            <Ban className="size-4" />
            Ban Client
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ChannelTreeItem({
  item,
  depth = 0,
  onDeleteChannel,
  onSwitchChannel,
}: {
  item: TreeItem
  depth?: number
  onDeleteChannel: (channel: ChannelTreeItem) => void
  onSwitchChannel: (channel: ChannelTreeItem) => void
}) {
  const paddingLeft = String(depth * 18 + 8) + "px"

  if (isClientTreeItem(item)) {
    const away = item.clientAway === "1" || item.clientAway === 1

    return (
      <ClientActions client={item}>
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

  const [serverInfo, setServerInfo] = useState<ServerInfo>({})
  const [channelList, setChannelList] = useState<ChannelRow[]>([])
  const [clientList, setClientList] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const channelTree = useMemo(
    () => createNestedList(mergeTreeItems(clientList, channelList)),
    [channelList, clientList],
  )

  const loadQueryUser = useCallback(async () => {
    const userInfo = await TeamSpeak.execute<QueryUser[]>("whoami")
    const nextQueryUser = userInfo[0] ?? {}

    saveQueryUser(nextQueryUser)

    return nextQueryUser
  }, [saveQueryUser])

  const ensureSelectedServer = useCallback(async () => {
    if (!isUsableServerId(selectedServerId)) {
      throw new Error("No valid virtual server selected.")
    }

    const validSelectedServerId = selectedServerId as string | number
    const nextQueryUser = await TeamSpeak.selectServer(validSelectedServerId)

    saveServerId(validSelectedServerId)

    if (nextQueryUser) {
      saveQueryUser(nextQueryUser)
    }

    return nextQueryUser
  }, [saveQueryUser, saveServerId, selectedServerId])

  const loadChannelTree = useCallback(
    async (options: { ensureSelection?: boolean } = {}) => {
      if (options.ensureSelection !== false) {
        await ensureSelectedServer()
      }

      const [nextChannels, nextClients] = await Promise.all([
        TeamSpeak.execute<ChannelRow[]>("channellist"),
        TeamSpeak.execute<ClientRow[]>("clientlist", {}, ["-voice", "-away"]),
      ])

      setChannelList(nextChannels)
      setClientList(nextClients)
      await loadQueryUser()
    },
    [ensureSelectedServer, loadQueryUser],
  )

  const loadServerViewer = useCallback(async () => {
    if (!isUsableServerId(selectedServerId)) {
      setServerInfo({})
      setChannelList([])
      setClientList([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      await ensureSelectedServer()

      const info = await TeamSpeak.execute<ServerInfo[]>("serverinfo")

      setServerInfo(info[0] ?? {})
      await loadChannelTree({ ensureSelection: false })
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [ensureSelectedServer, loadChannelTree, selectedServerId])

  const handleSwitchChannel = async (channel: ChannelTreeItem) => {
    setError(null)

    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("clientmove", {
        clid: queryUser.clientId,
        cid: channel.cid,
      })
      await loadChannelTree({ ensureSelection: false })
    } catch (switchError) {
      setError(getErrorMessage(switchError))
    }
  }

  const handleDeleteChannel = async (channel: ChannelTreeItem) => {
    setError(null)

    try {
      await ensureSelectedServer()
      await TeamSpeak.execute("channeldelete", {
        cid: channel.cid,
        force: 0,
      })
      await loadChannelTree({ ensureSelection: false })
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    }
  }

  useEffect(() => {
    void loadServerViewer()
  }, [loadServerViewer])

  useEffect(() => {
    if (!isUsableServerId(selectedServerId)) {
      return
    }

    const handleTreeEvent: EventListener = () => {
      void loadChannelTree().catch((treeError: unknown) => {
        setError(getErrorMessage(treeError))
      })
    }

    TeamSpeak.on("clientmoved", handleTreeEvent)
    TeamSpeak.on("clientconnect", handleTreeEvent)
    TeamSpeak.on("clientdisconnect", handleTreeEvent)
    TeamSpeak.on("channelcreate", handleTreeEvent)
    TeamSpeak.on("channeledit", handleTreeEvent)
    TeamSpeak.on("channelmoved", handleTreeEvent)
    TeamSpeak.on("channeldelete", handleTreeEvent)

    return () => {
      TeamSpeak.off("clientmoved", handleTreeEvent)
      TeamSpeak.off("clientconnect", handleTreeEvent)
      TeamSpeak.off("clientdisconnect", handleTreeEvent)
      TeamSpeak.off("channelcreate", handleTreeEvent)
      TeamSpeak.off("channeledit", handleTreeEvent)
      TeamSpeak.off("channelmoved", handleTreeEvent)
      TeamSpeak.off("channeldelete", handleTreeEvent)
    }
  }, [loadChannelTree, selectedServerId])

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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="truncate">
              {valueOrDash(serverInfo.virtualserverName)}
            </CardTitle>
          </div>
          <Button
            disabled={loading}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void loadServerViewer()}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Loading server viewer...
            </div>
          ) : channelTree.length ? (
            <div className="space-y-0.5 rounded-lg border p-2">
              {channelTree.map((item) => (
                <ChannelTreeItem
                  item={item}
                  key={item.id}
                  onDeleteChannel={(channel) => void handleDeleteChannel(channel)}
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
    </div>
  )
}
