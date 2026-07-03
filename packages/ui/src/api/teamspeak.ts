import NProgress from "nprogress"

import { socket } from "@/api/socket"

type TeamSpeakConnectParams = {
  host: string
  queryport: number
  protocol: "ssh" | "raw"
  username: string
  password: string
}

type AutofillResponse = {
  host?: string
  queryport?: number
  protocol?: "ssh" | "raw"
  username?: string
  password?: string
  message?: string
}

type QueryUser = {
  virtualserverId?: string | number
  [key: string]: unknown
}

type TeamSpeakError = {
  id?: string | number
  message?: string
  connected?: boolean
}

type ExecuteOptions = Record<string, unknown> | Array<unknown>

type TeamSpeakEventName =
  | "textmessage"
  | "clientconnect"
  | "clientdisconnect"
  | "clientmoved"
  | "tokenused"
  | "serveredit"
  | "channeledit"
  | "channelcreate"
  | "channelmoved"
  | "channeldelete"

const teamSpeakEvents = new EventTarget()

const socketEventMap: Record<string, TeamSpeakEventName> = {
  "teamspeak-textmessage": "textmessage",
  "teamspeak-clientconnect": "clientconnect",
  "teamspeak-clientdisconnect": "clientdisconnect",
  "teamspeak-clientmoved": "clientmoved",
  "teamspeak-tokenused": "tokenused",
  "teamspeak-serveredit": "serveredit",
  "teamspeak-channeledit": "channeledit",
  "teamspeak-channelcreate": "channelcreate",
  "teamspeak-channelmoved": "channelmoved",
  "teamspeak-channeldelete": "channeldelete",
}

NProgress.configure({
  showSpinner: false,
  minimum: 0.12,
  trickleSpeed: 180,
})

let pendingRequests = 0
let progressStartedAt = 0

const MIN_PROGRESS_VISIBLE_MS = 350

function startProgress() {
  pendingRequests += 1

  if (pendingRequests === 1) {
    progressStartedAt = Date.now()
    NProgress.start()
    return
  }

  NProgress.inc()
}

function stopProgress() {
  pendingRequests = Math.max(0, pendingRequests - 1)

  if (pendingRequests > 0) {
    NProgress.inc()
    return
  }

  const elapsed = Date.now() - progressStartedAt
  const delay = Math.max(0, MIN_PROGRESS_VISIBLE_MS - elapsed)

  window.setTimeout(() => {
    if (pendingRequests === 0) {
      NProgress.done()
    }
  }, delay)
}

function withProgress<T>(task: () => Promise<T>) {
  startProgress()

  return task().finally(() => {
    stopProgress()
  })
}

for (const [socketEvent, teamSpeakEvent] of Object.entries(socketEventMap)) {
  socket.on(socketEvent, (data: unknown) => {
    teamSpeakEvents.dispatchEvent(
      new CustomEvent(teamSpeakEvent, { detail: data }),
    )
  })
}

function ensureSocketConnected() {
  if (!socket.connected) {
    socket.connect()
  }
}

function isErrorResponse(response: TeamSpeakError) {
  return (
    (response.id !== undefined && response.id !== 0 && response.id !== "0") ||
    (response.id === undefined && Boolean(response.message))
  )
}

function handleResponse<T>(
  response: T | TeamSpeakError,
  resolve: (value: T | []) => void,
  reject: (reason?: unknown) => void,
) {
  const maybeError = response as TeamSpeakError

  if (isErrorResponse(maybeError)) {
    if (String(maybeError.id) === "1281") {
      resolve([])
      return
    }

    reject(response)
    return
  }

  resolve(response as T)
}

export const TeamSpeak = {
  connect(params: TeamSpeakConnectParams) {
    ensureSocketConnected()

    return withProgress(
      () =>
        new Promise<{ token: string }>((resolve, reject) => {
          socket.emit(
            "teamspeak-connect",
            params,
            (response: { token?: string }) => {
              if (response.token) {
                resolve({ token: response.token })
                return
              }

              reject(response)
            },
          )
        }),
    )
  },

  autofillForm(token: string) {
    ensureSocketConnected()

    return withProgress(
      () =>
        new Promise<AutofillResponse>((resolve, reject) => {
          socket.emit("autofillform", token, (response: AutofillResponse) => {
            if (response.host) {
              resolve(response)
              return
            }

            reject(response)
          })
        }),
    )
  },

  execute<T = unknown[]>(
    command: string,
    params: Record<string, unknown> = {},
    options: ExecuteOptions = [],
  ) {
    ensureSocketConnected()

    return withProgress(
      () =>
        new Promise<T | []>((resolve, reject) => {
          socket.emit(
            "teamspeak-execute",
            {
              command,
              params,
              options,
            },
            (response: T | TeamSpeakError) =>
              handleResponse<T>(response, resolve, reject),
          )
        }),
    )
  },

  registerEvents() {
    ensureSocketConnected()

    return withProgress(
      () =>
        new Promise<unknown>((resolve, reject) => {
          socket.emit(
            "teamspeak-registerevents",
            (response: TeamSpeakError | unknown) =>
              handleResponse(response, resolve, reject),
          )
        }),
    )
  },

  async selectServer(sid: string | number) {
    await TeamSpeak.execute("use", { sid })
    await TeamSpeak.registerEvents()

    const userInfo = await TeamSpeak.execute<QueryUser[]>("whoami")

    return userInfo[0]
  },

  on(name: TeamSpeakEventName, listener: EventListener) {
    teamSpeakEvents.addEventListener(name, listener)
  },

  off(name: TeamSpeakEventName, listener: EventListener) {
    teamSpeakEvents.removeEventListener(name, listener)
  },
}