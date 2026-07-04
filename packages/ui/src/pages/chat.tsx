import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Hash, Send, UserRound, X } from "lucide-react"

import { TeamSpeak } from "@/api/teamspeak"
import { useAuth, type QueryUser } from "@/auth/auth-context"
import { ToastStack, useToastStack } from "@/components/toast-stack"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type ChannelRow = {
  cid: string | number
  pid?: string | number
  channelName: string
  [key: string]: unknown
}

type ClientRow = {
  cid?: string | number
  clid: string | number
  clientAway?: string | number
  clientDatabaseId?: string | number
  clientInputMuted?: string | number
  clientNickname: string
  clientOutputMuted?: string | number
  [key: string]: unknown
}

type ServerInfo = {
  virtualserverId?: string | number
  virtualserverName?: string
  [key: string]: unknown
}

type ChatMessage = {
  id: number
  sender: {
    clid?: string | number
    clientNickname?: string
  }
  target: string | number
  targetmode: number
  text: string
  timestamp: Date
}

type TextMessageNotification = {
  invoker?: {
    clid?: string | number
    clientNickname?: string
  }
  msg?: string
  target?: string | number
  targetmode?: string | number
  [key: string]: unknown
}

type ChatLoadData = {
  channels: ChannelRow[]
  clients: ClientRow[]
  queryUser: QueryUser
  serverInfo: ServerInfo
}

type ActiveChat =
  | {
      label: string
      mode: "server"
      target: string | number
      targetmode: 3
      title: "Server Text Messages"
    }
  | {
      label: string
      mode: "channel"
      target: string | number
      targetmode: 2
      title: "Channel Text Messages"
    }
  | {
      label: string
      mode: "private"
      target: string | number
      targetmode: 1
      title: "Private Text Messages"
    }

const chatLoadFlights = new Map<string, Promise<ChatLoadData>>()

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

function getEventDetail(event: Event) {
  return event instanceof CustomEvent ? event.detail : undefined
}

function isTextMessageNotification(
  value: unknown,
): value is TextMessageNotification {
  return typeof value === "object" && value !== null
}

function formatTimestamp(timestamp: Date) {
  return timestamp.toLocaleString()
}

function formatChannelName(channelName: string) {
  return (
    channelName.replace(/^\[(?:\*?c|r|l)?spacer\d*\]\s*/i, "").trim() ||
    channelName
  )
}

function isIncomingMessageForActiveChat(
  notification: TextMessageNotification,
  activeChat: ActiveChat,
  queryUser: QueryUser,
) {
  const targetmode = Number(notification.targetmode)

  if (activeChat.mode === "private") {
    const senderClid = notification.invoker?.clid

    return (
      targetmode === 1 &&
      senderClid !== undefined &&
      String(senderClid) === String(activeChat.target)
    )
  }

  if (activeChat.mode === "channel") {
    const target =
      notification.target ??
      (targetmode === 2 ? queryUser.clientChannelId : undefined)

    return targetmode === 2 && String(target) === String(activeChat.target)
  }

  if (activeChat.mode === "server") {
    return targetmode === 3
  }

  return false
}

function ChatTab({
  active,
  children,
  onClick,
  onClose,
}: {
  active?: boolean
  children: string
  onClick: () => void
  onClose?: () => void
}) {
  return (
    <button
      className={cn(
        "flex min-w-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      type="button"
      onClick={onClick}
    >
      <span className="truncate">{children}</span>
      {onClose ? (
        <span
          aria-label="Close private chat"
          className="rounded-sm text-current opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }
          }}
        >
          <X className="size-4" />
        </span>
      ) : null}
    </button>
  )
}

export function Chat() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const cid = params.cid
  const clientId = searchParams.get("client") ?? ""
  const { queryUser, saveQueryUser, saveServerId, serverId } = useAuth()
  const queryUserRef = useRef(queryUser)
  const activeChatRef = useRef<ActiveChat | null>(null)
  const messageIdRef = useRef(0)
  const chatBottomRef = useRef<HTMLDivElement | null>(null)
  const { dismissToast, showError, toasts } = useToastStack()
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [serverInfo, setServerInfo] = useState<ServerInfo>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [privateClientId, setPrivateClientId] = useState(clientId)

  useEffect(() => {
    queryUserRef.current = queryUser
  }, [queryUser])

  useEffect(() => {
    if (clientId) {
      setPrivateClientId(clientId)
    }
  }, [clientId])

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

    return nextQueryUser ?? {}
  }, [saveQueryUser, saveServerId, selectedServerId])

  const loadChatData = useCallback(async () => {
    await ensureSelectedServer()

    const key = String(selectedServerId ?? "unknown")
    let flight = chatLoadFlights.get(key)

    if (!flight) {
      flight = (async () => {
        const [channelList, clientList, serverInfoList, userInfo] =
          await Promise.all([
            TeamSpeak.execute<ChannelRow[]>("channellist"),
            TeamSpeak.execute<ClientRow[]>("clientlist", {}, [
              "-voice",
              "-away",
            ]),
            TeamSpeak.execute<ServerInfo[]>("serverinfo"),
            TeamSpeak.execute<QueryUser[]>("whoami"),
          ])

        return {
          channels: channelList,
          clients: clientList,
          queryUser: userInfo[0] ?? {},
          serverInfo: serverInfoList[0] ?? {},
        }
      })().finally(() => {
        chatLoadFlights.delete(key)
      })

      chatLoadFlights.set(key, flight)
    }

    return flight
  }, [ensureSelectedServer, selectedServerId])

  useEffect(() => {
    let active = true

    setLoading(true)

    loadChatData()
      .then((data) => {
        if (!active) {
          return
        }

        setChannels(data.channels)
        setClients(data.clients)
        setServerInfo(data.serverInfo)
        queryUserRef.current = data.queryUser
        saveQueryUser(data.queryUser)
      })
      .catch((loadError: unknown) => {
        if (active) {
          showError(getErrorMessage(loadError))
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [loadChatData, saveQueryUser, showError])

  const refreshClients = useCallback(async () => {
    try {
      await ensureSelectedServer()
      setClients(
        await TeamSpeak.execute<ClientRow[]>(
          "clientlist",
          {},
          ["-voice", "-away"],
          { progress: "background" },
        ),
      )
    } catch (refreshError) {
      showError(getErrorMessage(refreshError))
    }
  }, [ensureSelectedServer, showError])

  const refreshChannels = useCallback(async () => {
    try {
      await ensureSelectedServer()
      setChannels(
        await TeamSpeak.execute<ChannelRow[]>("channellist", {}, [], {
          progress: "background",
        }),
      )
    } catch (refreshError) {
      showError(getErrorMessage(refreshError))
    }
  }, [ensureSelectedServer, showError])

  useEffect(() => {
    TeamSpeak.on("clientconnect", refreshClients)
    TeamSpeak.on("clientdisconnect", refreshClients)
    TeamSpeak.on("channeledit", refreshChannels)
    TeamSpeak.on("channelcreate", refreshChannels)
    TeamSpeak.on("channeldelete", refreshChannels)

    return () => {
      TeamSpeak.off("clientconnect", refreshClients)
      TeamSpeak.off("clientdisconnect", refreshClients)
      TeamSpeak.off("channeledit", refreshChannels)
      TeamSpeak.off("channelcreate", refreshChannels)
      TeamSpeak.off("channeldelete", refreshChannels)
    }
  }, [refreshChannels, refreshClients])

  const currentChannel = useMemo(
    () => channels.find((channel) => String(channel.cid) === String(cid)),
    [channels, cid],
  )
  const targetClient = useMemo(
    () => clients.find((client) => String(client.clid) === String(clientId)),
    [clientId, clients],
  )
  const privateTabClient = useMemo(
    () =>
      clients.find((client) => String(client.clid) === String(privateClientId)),
    [clients, privateClientId],
  )
  const fallbackChannelId = useMemo(() => {
    if (cid) {
      return cid
    }

    if (queryUser.clientChannelId !== undefined) {
      return String(queryUser.clientChannelId)
    }

    return channels[0] ? String(channels[0].cid) : undefined
  }, [channels, cid, queryUser.clientChannelId])
  const fallbackChannel = useMemo(
    () =>
      channels.find(
        (channel) => String(channel.cid) === String(fallbackChannelId ?? ""),
      ),
    [channels, fallbackChannelId],
  )

  const activeChat = useMemo<ActiveChat>(() => {
    if (clientId) {
      return {
        label: targetClient?.clientNickname ?? `Client ${clientId}`,
        mode: "private",
        target: clientId,
        targetmode: 1,
        title: "Private Text Messages",
      }
    }

    if (cid) {
      return {
        label: currentChannel?.channelName
          ? formatChannelName(currentChannel.channelName)
          : `Channel ${cid}`,
        mode: "channel",
        target: cid,
        targetmode: 2,
        title: "Channel Text Messages",
      }
    }

    return {
      label: serverInfo.virtualserverName ?? "Server",
      mode: "server",
      target: serverInfo.virtualserverId ?? selectedServerId ?? 0,
      targetmode: 3,
      title: "Server Text Messages",
    }
  }, [
    cid,
    clientId,
    currentChannel?.channelName,
    selectedServerId,
    serverInfo.virtualserverId,
    serverInfo.virtualserverName,
    targetClient?.clientNickname,
  ])

  useEffect(() => {
    activeChatRef.current = activeChat
  }, [activeChat])

  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (chatMessage) =>
          chatMessage.targetmode === activeChat.targetmode &&
          String(chatMessage.target) === String(activeChat.target),
      ),
    [activeChat, messages],
  )

  const appendMessage = useCallback((nextMessage: Omit<ChatMessage, "id">) => {
    messageIdRef.current += 1

    setMessages((currentMessages) => [
      ...currentMessages.slice(-49),
      {
        ...nextMessage,
        id: messageIdRef.current,
      },
    ])
  }, [])

  useEffect(() => {
    const handleTextMessage = (event: Event) => {
      const detail = getEventDetail(event)
      const currentActiveChat = activeChatRef.current

      if (!isTextMessageNotification(detail) || !currentActiveChat) {
        return
      }

      if (
        detail.invoker?.clid !== undefined &&
        String(detail.invoker.clid) ===
          String(queryUserRef.current.clientId ?? "")
      ) {
        return
      }

      if (
        !isIncomingMessageForActiveChat(
          detail,
          currentActiveChat,
          queryUserRef.current,
        )
      ) {
        return
      }

      const target =
        currentActiveChat.mode === "private"
          ? currentActiveChat.target
          : (detail.target ?? currentActiveChat.target)

      appendMessage({
        sender: {
          clid: detail.invoker?.clid,
          clientNickname: detail.invoker?.clientNickname,
        },
        target,
        targetmode: Number(detail.targetmode),
        text: String(detail.msg ?? ""),
        timestamp: new Date(),
      })
    }

    TeamSpeak.on("textmessage", handleTextMessage)

    return () => {
      TeamSpeak.off("textmessage", handleTextMessage)
    }
  }, [appendMessage])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ block: "end" })
  }, [visibleMessages])

  const moveQueryClientToChannel = useCallback(
    async (nextCid: string | number) => {
      let currentQueryUser = queryUserRef.current

      if (!currentQueryUser.clientId) {
        const userInfo = await TeamSpeak.execute<QueryUser[]>(
          "whoami",
          {},
          [],
          { progress: "background" },
        )

        if (userInfo[0]) {
          currentQueryUser = userInfo[0]
          queryUserRef.current = userInfo[0]
          saveQueryUser(userInfo[0])
        }
      }

      const ownClientId = currentQueryUser.clientId

      if (!ownClientId) {
        return
      }

      if (String(currentQueryUser.clientChannelId ?? "") === String(nextCid)) {
        return
      }

      await ensureSelectedServer()
      await TeamSpeak.execute(
        "clientmove",
        {
          clid: ownClientId,
          cid: nextCid,
        },
        [],
        { progress: "background" },
      )

      const nextQueryUser = await TeamSpeak.execute<QueryUser[]>(
        "whoami",
        {},
        [],
        { progress: "background" },
      )

      if (nextQueryUser[0]) {
        queryUserRef.current = nextQueryUser[0]
        saveQueryUser(nextQueryUser[0])
      }
    },
    [ensureSelectedServer, saveQueryUser],
  )

  const navigateServer = () => {
    navigate("/chat")
  }

  const navigateChannel = (nextCid = fallbackChannelId) => {
    if (nextCid) {
      void moveQueryClientToChannel(nextCid).catch((moveError: unknown) => {
        showError(getErrorMessage(moveError))
      })
      navigate("/chat/" + String(nextCid))
      return
    }

    navigate("/chat")
  }

  const navigatePrivate = (nextClientId = privateClientId) => {
    if (!nextClientId) {
      return
    }

    setPrivateClientId(String(nextClientId))
    navigate(
      (cid ? "/chat/" + String(cid) : "/chat") +
        "?client=" +
        String(nextClientId),
    )
  }

  const closePrivate = () => {
    setPrivateClientId("")

    if (clientId) {
      if (fallbackChannelId) {
        navigate("/chat/" + String(fallbackChannelId))
        return
      }

      navigate("/chat")
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSubmitting(true)

    try {
      await ensureSelectedServer()

      if (activeChat.mode === "channel") {
        await moveQueryClientToChannel(activeChat.target)
      }

      await TeamSpeak.execute("sendtextmessage", {
        targetmode: activeChat.targetmode,
        target: activeChat.target,
        msg: message,
      })

      appendMessage({
        sender: {
          clid: queryUserRef.current.clientId as string | number | undefined,
          clientNickname: queryUserRef.current.clientNickname as
            string | undefined,
        },
        target: activeChat.target,
        targetmode: activeChat.targetmode,
        text: message,
        timestamp: new Date(),
      })
      setMessage("")
    } catch (submitError) {
      showError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const serverTabLabel = serverInfo.virtualserverName ?? "Server"
  const channelTabLabel =
    fallbackChannel?.channelName
      ? formatChannelName(fallbackChannel.channelName)
      : "Channel"
  const privateTabLabel =
    privateTabClient?.clientNickname ??
    (privateClientId ? `Client ${privateClientId}` : "Private")
  const hasPrivateTab = Boolean(privateClientId)

  const busy = loading || submitting

  return (
    <div className="mx-auto h-[calc(98dvh-6rem)] min-h-0 w-full max-w-[1280px] overflow-hidden">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <Card className="h-full overflow-hidden border bg-card text-card-foreground shadow-none">
        <CardContent className="grid h-full min-h-0 grid-cols-1 p-0 md:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-hidden border-b bg-muted/20 md:border-b-0 md:border-r">
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
              <div className="px-5 pb-2 pt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Channels
              </div>

              <div className="space-y-1 px-4 pb-4">
                {channels.map((channel) => {
                  const selected = String(channel.cid) === String(cid ?? "")

                  return (
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                        selected && "bg-background text-foreground shadow-sm",
                      )}
                      key={channel.cid}
                      type="button"
                      onClick={() => navigateChannel(String(channel.cid))}
                    >
                      <Hash className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {formatChannelName(channel.channelName)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {channel.cid}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="border-t px-5 pb-2 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Clients
              </div>

              <div className="space-y-1 px-4 pb-4">
                {clients.map((client) => {
                  const selected = String(client.clid) === String(clientId)

                  return (
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                        selected && "bg-background text-foreground shadow-sm",
                      )}
                      key={client.clid}
                      type="button"
                      onClick={() => navigatePrivate(String(client.clid))}
                    >
                      <UserRound className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {client.clientNickname}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col bg-card">
            <div
              className={cn(
                "grid shrink-0 gap-2 border-b px-4 py-3",
                hasPrivateTab ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              <ChatTab
                active={activeChat.mode === "server"}
                onClick={navigateServer}
              >
                {serverTabLabel}
              </ChatTab>
              <ChatTab
                active={activeChat.mode === "channel"}
                onClick={() => navigateChannel()}
              >
                {channelTabLabel}
              </ChatTab>
              {privateClientId ? (
                <ChatTab
                  active={activeChat.mode === "private"}
                  onClick={() => navigatePrivate()}
                  onClose={closePrivate}
                >
                  {privateTabLabel}
                </ChatTab>
              ) : null}
            </div>

            <div className="shrink-0 px-4 py-2 text-center">
              <div className="text-sm font-medium text-muted-foreground">
                {activeChat.title}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {activeChat.label}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {visibleMessages.length ? (
                    <div className="space-y-3">
                      {visibleMessages.map((chatMessage) => {
                        const outgoing =
                          chatMessage.sender.clid !== undefined &&
                          String(chatMessage.sender.clid) ===
                            String(queryUserRef.current.clientId ?? "")

                        return (
                          <div
                            className={cn(
                              "text-sm",
                              outgoing ? "text-right" : "text-left",
                            )}
                            key={chatMessage.id}
                          >
                            <div className="text-xs text-muted-foreground">
                              {formatTimestamp(chatMessage.timestamp)}{" "}
                              <span className="font-semibold">
                                {chatMessage.sender.clientNickname ||
                                  (outgoing ? "You" : "Client")}
                              </span>
                            </div>
                            <div className="mt-1 whitespace-pre-wrap break-words">
                              {chatMessage.text}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                  <div ref={chatBottomRef} />
                </div>

                <form className="shrink-0 border-t p-3" onSubmit={handleSubmit}>
                  <div className="flex items-center gap-2 rounded-md border bg-background px-3 transition-colors focus-within:border-ring">
                    <input
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={busy}
                      placeholder="Send message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                    <Button
                      aria-label="Send message"
                      className="size-8"
                      disabled={busy}
                      size="icon"
                      type="submit"
                      variant="ghost"
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                </form>
              </>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
