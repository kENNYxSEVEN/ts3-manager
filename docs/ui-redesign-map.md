# UI redesign map

## Goal

Redesign the original TS3 Manager frontend with React + shadcn/ui while preserving the original product logic, backend API, socket flow, routes, and feature structure.

This is a frontend redesign, not a new product flow.

## Important legacy files

| Purpose | Legacy file |
|---|---|
| Root Vue app | `legacy/ui-old/src/App.vue` |
| App bootstrap | `legacy/ui-old/src/main.js` |
| Socket handling | `legacy/ui-old/src/socket.js` |
| TeamSpeak API wrapper | `legacy/ui-old/src/api/TeamSpeak.js` |
| Router setup | `legacy/ui-old/src/router/index.js` |
| Route list | `legacy/ui-old/src/router/routes.js` |
| Main app shell / navigation | `legacy/ui-old/src/components/AppShell.vue` |
| Login screen | `legacy/ui-old/src/components/Login.vue` |

## Original Vue UI routes

| Original route | Route name | Legacy component | React replacement | Status |
|---|---|---|---|---|
| `/` | `login` | `Login` | `LoginPage` | todo |
| `/login` | `login` | `Login` | `LoginPage` | todo |
| `/logout` | `logout` | `Logout` | `LogoutPage` | todo |
| `/servers` | `servers` | `Servers` | `ServersPage` | todo |
| `/server/create` | `server-create` | `ServerCreate` | `ServerCreatePage` | todo |
| `/server/edit` | `server-edit` | `ServerEdit` | `ServerEditPage` | todo |
| `/serverviewer` | `serverviewer` | `ServerViewer` | `ServerViewerPage` | todo |
| `/chat/:cid?` | `chat` | `TextMessages` | `ChatPage` | todo |
| `/files` | `files` | `FileBrowser` | `FilesPage` | todo |
| `/file/upload/:cid` | `file-upload` | `FileUpload` | `FileUploadPage` | todo |
| `/logs` | `logs` | `ServerLogs` | `ServerLogsPage` | todo |
| `/snapshot` | `snapshot` | `ServerSnapshot` | `SnapshotPage` | todo |
| `/console` | `console` | `Console` | `ConsolePage` | todo |
| `/tokens` | `tokens` | `Tokens` | `TokensPage` | todo |
| `/token/add` | `token-add` | `TokenAdd` | `TokenAddPage` | todo |
| `/apikeys` | `apikeys` | `ApiKeys` | `ApiKeysPage` | todo |
| `/apikey/add` | `apikey-add` | `ApiKeyAdd` | `ApiKeyAddPage` | todo |
| `/bans` | `bans` | `Bans` | `BansPage` | todo |
| `/ban/add` | `ban-add` | `BanAdd` | `BanAddPage` | todo |
| `/ban/:banid/edit` | `ban-edit` | `BanEdit` | `BanEditPage` | todo |
| `/complaints` | `complaints` | `Complaints` | `ComplaintsPage` | todo |
| `/clients` | `clients` | `Clients` | `ClientsPage` | todo |
| `/client/:cldbid/ban` | `client-ban` | `ClientBan` | `ClientBanPage` | todo |
| `/client/:clid/edit` | `client-edit` | `ClientEdit` | `ClientEditPage` | todo |
| `/servergroups` | `servergroups` | `ServerGroups` | `ServerGroupsPage` | todo |
| `/servergroup/:sgid/edit` | `servergroup-edit` | `ServerGroupEdit` | `ServerGroupEditPage` | todo |
| `/channelgroups` | `channelgroups` | `ChannelGroups` | `ChannelGroupsPage` | todo |
| `/channelgroup/:cgid/edit` | `channelgroup-edit` | `ChannelGroupEdit` | `ChannelGroupEditPage` | todo |
| `/channel/:cid/edit` | `channel-edit` | `ChannelEdit` | `ChannelEditPage` | todo |
| `/channel/add` | `channel-add` | `ChannelAdd` | `ChannelAddPage` | todo |
| `/spacer/add` | `spacer-add` | `ChannelSpacerAdd` | `ChannelSpacerAddPage` | todo |
| `/permissions/client/:cldbid?` | `permissions-client` | `ClientPermissions` | `ClientPermissionsPage` | todo |
| `/permissions/servergroup/:sgid?` | `permissions-servergroup` | `ServerGroupPermissions` | `ServerGroupPermissionsPage` | todo |
| `/permissions/channel/:cid?` | `permissions-channel` | `ChannelPermissions` | `ChannelPermissionsPage` | todo |
| `/permissions/channelgroup/:cgid?` | `permissions-channelgroup` | `ChannelGroupPermissions` | `ChannelGroupPermissionsPage` | todo |
| `/permissions/channel/:cid?/client/:cldbid?` | `permissions-channelclient` | `ChannelClientPermissions` | `ChannelClientPermissionsPage` | todo |
| `*` | `404` | `NotFound` | `NotFoundPage` | todo |

## Main navigation from legacy AppShell

| Section | Route name |
|---|---|
| Servers | `servers` |
| Server Viewer | `serverviewer` |
| Chat | `chat` |
| Files | `files` |
| Logs | `logs` |
| Snapshot | `snapshot` |
| Console | `console` |
| Tokens | `tokens` |
| API Keys | `apikeys` |
| Bans | `bans` |
| Complaints | `complaints` |
| Clients | `clients` |
| Server Groups | `servergroups` |
| Channel Groups | `channelgroups` |
| Server Group Permissions | `permissions-servergroup` |
| Client Permissions | `permissions-client` |
| Channel Permissions | `permissions-channel` |
| Channel Group Permissions | `permissions-channelgroup` |
| Channel Client Permissions | `permissions-channelclient` |
| Logout | `logout` |

## Migration principle

Do not invent a new dashboard flow.

The redesign should preserve:

- original routes;
- original navigation structure;
- original login/session logic;
- original socket behavior;
- original API wrapper behavior;
- original feature grouping.

React + shadcn/ui should replace only the presentation layer first.