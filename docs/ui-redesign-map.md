# UI redesign map

## Goal

Redesign the original TS3 Manager frontend with React + shadcn/ui while preserving the original product logic, backend API, socket flow, routes, and feature structure.

This is a frontend redesign, not a new product flow.

The backend should stay untouched unless a small compatibility change is absolutely required.

## Current migration state

| Area | Status |
|---|---|
| Original Vue UI preserved | done |
| New React + Vite UI scaffolded | done |
| Tailwind + shadcn/ui foundation | done |
| Original routes mapped | documented |
| Original auth/session flow | documented |
| React routes | todo |
| React auth layer | todo |
| Real backend/socket integration | todo |
| Original screens redesigned | todo |

## Important legacy files

| Purpose | Legacy file |
|---|---|
| Root Vue app | `legacy/ui-old/src/App.vue` |
| App bootstrap | `legacy/ui-old/src/main.js` |
| Socket handling | `legacy/ui-old/src/socket.js` |
| TeamSpeak API wrapper | `legacy/ui-old/src/api/TeamSpeak.js` |
| Vue router setup | `legacy/ui-old/src/router/index.js` |
| Vue route list | `legacy/ui-old/src/router/routes.js` |
| Vuex store root | `legacy/ui-old/src/store/index.js` |
| Query/session store module | `legacy/ui-old/src/store/modules/query.js` |
| Settings store module | `legacy/ui-old/src/store/modules/settings.js` |
| Main app shell / navigation | `legacy/ui-old/src/components/AppShell.vue` |
| Login screen | `legacy/ui-old/src/components/Login.vue` |
| Servers screen | `legacy/ui-old/src/components/Servers.vue` |
| Server viewer screen | `legacy/ui-old/src/components/ServerViewer.vue` |

## Migration principle

Do not invent a new dashboard flow.

The redesign should preserve:

- original routes;
- original route names conceptually;
- original navigation structure;
- original login/session logic;
- original socket behavior;
- original API wrapper behavior;
- original feature grouping;
- original post-login redirect to `servers`;
- original TeamSpeak ServerQuery connection model.

React + shadcn/ui should replace the presentation layer first.

## Original Vue UI routes

| Original route | Route name | Legacy component | Auth required | React replacement | Status |
|---|---|---|---|---|---|
| `/` | redirect to `login` | — | no | redirect to `/login` | todo |
| `/login` | `login` | `Login` | no | `LoginPage` | todo |
| `/logout` | `logout` | `Logout` | yes | `LogoutPage` | todo |
| `/servers` | `servers` | `Servers` | yes | `ServersPage` | todo |
| `/server/create` | `server-create` | `ServerCreate` | yes | `ServerCreatePage` | todo |
| `/server/edit` | `server-edit` | `ServerEdit` | yes | `ServerEditPage` | todo |
| `/serverviewer` | `serverviewer` | `ServerViewer` | yes | `ServerViewerPage` | todo |
| `/chat/:cid?` | `chat` | `TextMessages` | yes | `ChatPage` | todo |
| `/files` | `files` | `FileBrowser` | yes | `FilesPage` | todo |
| `/file/upload/:cid` | `file-upload` | `FileUpload` | yes | `FileUploadPage` | todo |
| `/logs` | `logs` | `ServerLogs` | yes | `ServerLogsPage` | todo |
| `/snapshot` | `snapshot` | `ServerSnapshot` | yes | `SnapshotPage` | todo |
| `/console` | `console` | `Console` | yes | `ConsolePage` | todo |
| `/tokens` | `tokens` | `Tokens` | yes | `TokensPage` | todo |
| `/token/add` | `token-add` | `TokenAdd` | yes | `TokenAddPage` | todo |
| `/apikeys` | `apikeys` | `ApiKeys` | yes | `ApiKeysPage` | todo |
| `/apikey/add` | `apikey-add` | `ApiKeyAdd` | yes | `ApiKeyAddPage` | todo |
| `/bans` | `bans` | `Bans` | yes | `BansPage` | todo |
| `/ban/add` | `ban-add` | `BanAdd` | yes | `BanAddPage` | todo |
| `/ban/:banid/edit` | `ban-edit` | `BanEdit` | yes | `BanEditPage` | todo |
| `/complaints` | `complaints` | `Complaints` | yes | `ComplaintsPage` | todo |
| `/clients` | `clients` | `Clients` | yes | `ClientsPage` | todo |
| `/client/:cldbid/ban` | `client-ban` | `ClientBan` | yes | `ClientBanPage` | todo |
| `/client/:clid/edit` | `client-edit` | `ClientEdit` | yes | `ClientEditPage` | todo |
| `/servergroups` | `servergroups` | `ServerGroups` | yes | `ServerGroupsPage` | todo |
| `/servergroup/:sgid/edit` | `servergroup-edit` | `ServerGroupEdit` | yes | `ServerGroupEditPage` | todo |
| `/channelgroups` | `channelgroups` | `ChannelGroups` | yes | `ChannelGroupsPage` | todo |
| `/channelgroup/:cgid/edit` | `channelgroup-edit` | `ChannelGroupEdit` | yes | `ChannelGroupEditPage` | todo |
| `/channel/:cid/edit` | `channel-edit` | `ChannelEdit` | yes | `ChannelEditPage` | todo |
| `/channel/add` | `channel-add` | `ChannelAdd` | yes | `ChannelAddPage` | todo |
| `/spacer/add` | `spacer-add` | `ChannelSpacerAdd` | yes | `ChannelSpacerAddPage` | todo |
| `/permissions/client/:cldbid?` | `permissions-client` | `ClientPermissions` | yes | `ClientPermissionsPage` | todo |
| `/permissions/servergroup/:sgid?` | `permissions-servergroup` | `ServerGroupPermissions` | yes | `ServerGroupPermissionsPage` | todo |
| `/permissions/channel/:cid?/client/:cldbid?` | `permissions-channelclient` | `ChannelClientPermissions` | yes | `ChannelClientPermissionsPage` | todo |
| `/permissions/channel/:cid?` | `permissions-channel` | `ChannelPermissions` | yes | `ChannelPermissionsPage` | todo |
| `/permissions/channelgroup/:cgid?` | `permissions-channelgroup` | `ChannelGroupPermissions` | yes | `ChannelGroupPermissionsPage` | todo |
| `/test` | `test` | `Test` | no | probably skip / dev-only | todo |
| `*` | `404` | `NotFound` | no | `NotFoundPage` | todo |

## Important route ordering note

The original Vue router keeps this order:

1. `/permissions/channel/:cid?/client/:cldbid?`
2. `/permissions/channel/:cid?`

This order matters because the more specific channel-client permissions route must be matched before the generic channel permissions route.

Preserve this ordering in React Router as well.

## Main navigation from legacy AppShell

| Section | Route name | Route path |
|---|---|---|
| Servers | `servers` | `/servers` |
| Server Viewer | `serverviewer` | `/serverviewer` |
| Chat | `chat` | `/chat` |
| Files | `files` | `/files` |
| Logs | `logs` | `/logs` |
| Snapshot | `snapshot` | `/snapshot` |
| Console | `console` | `/console` |
| Tokens | `tokens` | `/tokens` |
| API Keys | `apikeys` | `/apikeys` |
| Bans | `bans` | `/bans` |
| Complaints | `complaints` | `/complaints` |
| Clients | `clients` | `/clients` |
| Server Groups | `servergroups` | `/servergroups` |
| Channel Groups | `channelgroups` | `/channelgroups` |
| Server Group Permissions | `permissions-servergroup` | `/permissions/servergroup` |
| Client Permissions | `permissions-client` | `/permissions/client` |
| Channel Permissions | `permissions-channel` | `/permissions/channel` |
| Channel Group Permissions | `permissions-channelgroup` | `/permissions/channelgroup` |
| Channel Client Permissions | `permissions-channelclient` | `/permissions/channel/client` |
| Logout | `logout` | `/logout` |

## Original auth / session flow

### Login form

Legacy file:

```txt
legacy/ui-old/src/components/Login.vue
```

Original fields:

- `host`
- `queryport`
- `ssh`
- `username`
- `password`
- `rememberLogin`

Original defaults:

```js
form: {
  host: "",
  queryport: 10022,
  ssh: true,
  username: "",
  password: "",
}
```

Port behavior:

```js
if (ssh === true) queryport = 10022
if (ssh === false) queryport = 10011
```

The React login page must preserve this behavior.

### Connect flow

`Login.vue` calls:

```js
this.$TeamSpeak.connect({
  host: this.form.host,
  queryport: this.form.queryport,
  protocol: this.form.ssh ? "ssh" : "raw",
  username: this.form.username,
  password: this.form.password,
})
```

`TeamSpeak.connect` emits:

```js
socket.emit("teamspeak-connect", params, callback)
```

Expected successful backend response:

```js
{ token }
```

After successful connection, the original UI does:

```js
this.$store.dispatch("saveToken", token)
this.$store.commit("isConnected", true)
this.$store.commit("isLoggedOut", false)
this.$router.push({ name: "servers" })
```

React equivalent:

- call `teamspeak-connect`;
- save token;
- set connected state to `true`;
- set logged out state to `false`;
- navigate to `/servers`.

### Autofill flow

When entering the login route, the original `Login.vue`:

1. reads `store.state.query.token`;
2. commits `isLoggedOut(true)`;
3. if no token exists, stops;
4. if token exists, emits `autofillform`;
5. if backend returns saved credentials, fills the form;
6. otherwise removes token and shows error.

Original socket call:

```js
socket.emit("autofillform", token, (response) => {
  if (response.host) {
    form.host = response.host
    form.queryport = response.queryport
    form.ssh = response.protocol === "ssh"
    form.username = response.username
    form.password = response.password
  } else {
    removeToken()
    showError(response)
  }
})
```

React should preserve the same behavior.

## Original router guard behavior

Legacy file:

```txt
legacy/ui-old/src/router/index.js
```

Original logic:

```js
if (to.meta.requiresAuth) {
  if (store.state.query.connected) {
    next()
  } else {
    next({ name: "login" })
  }
} else {
  if (to.name === "login" && store.state.query.connected) {
    next({ name: "servers" })
  } else {
    next()
  }
}
```

React equivalent:

- protected routes require `connected === true`;
- unauthenticated users are redirected to `/login`;
- if already connected and opening `/login`, redirect to `/servers`.

## Original socket behavior

Legacy file:

```txt
legacy/ui-old/src/socket.js
```

Socket initialization:

```js
const socket = io(process.env.VUE_APP_WEBSOCKET_URI, {
  withCredentials: true,
  autoConnect: false,
})
```

React equivalent should use:

```ts
io(import.meta.env.VITE_WEBSOCKET_URI, {
  withCredentials: true,
  autoConnect: false,
})
```

or a safe local fallback during development.

### Socket logout behavior

Original `handleLogout`:

```js
store.commit("isConnected", false)

if (router.currentRoute.name !== "login") {
  router.push({ name: "login" })
}
```

Events:

| Event | Behavior |
|---|---|
| `connectError` | show persistent error, mark disconnected, redirect to login |
| `connect` | dismiss connection error, show reconnected message |
| `disconnect` | mark disconnected, redirect to login |

## Original TeamSpeak API wrapper behavior

Legacy file:

```txt
legacy/ui-old/src/api/TeamSpeak.js
```

Core methods:

| Method | Socket event |
|---|---|
| `TeamSpeak.connect(params)` | `teamspeak-connect` |
| `TeamSpeak.execute(command, params, options)` | `teamspeak-execute` |
| `TeamSpeak.createSnapshot()` | `teamspeak-createsnapshot` |
| `TeamSpeak.deploySnapshot(snapshot)` | `teamspeak-deploysnapshot` |
| `TeamSpeak.registerEvents()` | `teamspeak-registerevents` |
| `TeamSpeak.unregisterEvent()` | `teamspeak-unregisterevent` |

The wrapper handles TeamSpeak errors and connection loss.

If response means the TeamSpeak connection is inactive:

- clear storage;
- redirect to login;
- reject the request.

Special case:

```js
if (error.id === "1281") {
  resolve([])
}
```

This special empty-result behavior should be preserved in the React API wrapper.

### TeamSpeak disconnect event

Original behavior:

```js
socket.on("teamspeak-disconnect", () => {
  store.dispatch("clearStorage")
  router.push({ name: "login" })
})
```

React equivalent:

- clear auth/session storage;
- set connected to `false`;
- navigate to `/login`.

## Original Vuex store structure

Legacy store files:

```txt
legacy/ui-old/src/store/index.js
legacy/ui-old/src/store/modules/query.js
legacy/ui-old/src/store/modules/settings.js
legacy/ui-old/src/store/modules/avatars.js
legacy/ui-old/src/store/modules/chat.js
legacy/ui-old/src/store/modules/logs.js
legacy/ui-old/src/store/modules/uploads.js
```

Important session state:

| State | Meaning |
|---|---|
| `query.token` | token from cookie |
| `query.connected` | active TeamSpeak connection state |
| `query.loggedOut` | logout/login screen state |
| `settings.rememberLogin` | whether token should be persisted longer |

Important mutations/actions:

| Vuex name | Meaning |
|---|---|
| `setToken` | update token state |
| `isConnected` | update connection state |
| `isLoggedOut` | update logged-out state |
| `saveToken` | save token into cookies and state |
| `removeToken` | remove token from cookies and state |
| `clearStorage` | clear persisted app/session state |
| `setRememberLogin` | update remember-login setting |
| `saveConnection` | mark connected and persist connection data |

## Token persistence

The original query store reads token from cookies:

```js
token: Cookies.get("token")
```

The original `saveToken` uses:

```js
Cookies.set("token", token, {
  expires: rootState.settings.rememberLogin ? 365 : undefined,
})
```

The original `removeToken` uses:

```js
Cookies.remove("token")
```

React should use cookies too, not localStorage, unless a deliberate migration decision is made later.

Recommended package:

```txt
js-cookie
```

## React frontend architecture target

Recommended structure:

```txt
packages/ui/src/
  api/
    socket.ts
    teamspeak.ts
  auth/
    auth-context.tsx
    protected-route.tsx
  layouts/
    app-layout.tsx
  pages/
    login-page.tsx
    logout-page.tsx
    servers-page.tsx
    server-viewer-page.tsx
    placeholder-page.tsx
  routes/
    app-routes.tsx
  components/
    ui/
```

## First real React migration step

The next coding step should be:

1. add `react-router-dom`;
2. add `js-cookie`;
3. add `socket.io-client` if not already installed in the new UI workspace;
4. create `api/socket.ts`;
5. create `api/teamspeak.ts`;
6. create `auth/auth-context.tsx`;
7. create `auth/protected-route.tsx`;
8. implement `LoginPage` with original fields and original connect behavior;
9. redirect successful login to `/servers`.

## Do not do yet

Do not implement a custom `/dashboard` route.

Do not change the backend.

Do not redesign feature flow before the corresponding legacy component is inspected.

Do not replace cookie token persistence with localStorage until there is a reason.

Do not remove original routes just because they are not implemented yet.

## Recommended commit order

```txt
Add original auth flow notes
Map original UI routes to React
Add React auth and socket foundation
Implement TeamSpeak login screen
Add protected route handling
Add app shell navigation
Start Servers page redesign
Start Server Viewer page redesign
```
