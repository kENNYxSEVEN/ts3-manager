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

type TeamSpeakError = {
  id?: string | number
  message?: string
  connected?: boolean
}

type ExecuteOptions = Record<string, unknown> | Array<unknown>

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

    return new Promise<{ token: string }>((resolve, reject) => {
      socket.emit("teamspeak-connect", params, (response: { token?: string }) => {
        if (response.token) {
          resolve({ token: response.token })
          return
        }

        reject(response)
      })
    })
  },

  autofillForm(token: string) {
    ensureSocketConnected()

    return new Promise<AutofillResponse>((resolve, reject) => {
      socket.emit("autofillform", token, (response: AutofillResponse) => {
        if (response.host) {
          resolve(response)
          return
        }

        reject(response)
      })
    })
  },

  execute<T = unknown[]>(
    command: string,
    params: Record<string, unknown> = {},
    options: ExecuteOptions = [],
  ) {
    ensureSocketConnected()

    return new Promise<T | []>((resolve, reject) => {
      socket.emit(
        "teamspeak-execute",
        {
          command,
          params,
          options,
        },
        (response: T | TeamSpeakError) => handleResponse<T>(response, resolve, reject),
      )
    })
  },
}
