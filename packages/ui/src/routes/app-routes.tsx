import { Navigate, Route, Routes } from "react-router-dom"

import { ProtectedRoute } from "@/auth/protected-route"
import { AppLayout } from "@/layouts/app-layout"
import { ChannelForm } from "@/pages/channel-form"
import { ChannelClientPermissions } from "@/pages/channel-client-permissions"
import { ChannelGroupPermissions } from "@/pages/channel-group-permissions"
import { ChannelPermissions } from "@/pages/channel-permissions"
import { Chat } from "@/pages/chat"
import { ClientBan } from "@/pages/client-ban"
import { ClientEdit } from "@/pages/client-edit"
import { ClientPermissions } from "@/pages/client-permissions"
import { Console } from "@/pages/console"
import { FileUpload } from "@/pages/file-upload"
import { Files } from "@/pages/files"
import { LoginPage } from "@/pages/login"
import { Logs } from "@/pages/logs"
import { LogoutPage } from "@/pages/logout"
import { PlaceholderPage } from "@/pages/placeholder"
import { ServerViewerPage } from "@/pages/server-viewer"
import { ServerGroupPermissions } from "@/pages/server-group-permissions"
import { ServerEdit } from "@/pages/server-edit"
import { ServersPage } from "@/pages/servers"
import { Snapshot } from "@/pages/snapshot"
import { SpacerAdd } from "@/pages/spacer-add"
import { Tokens } from "@/pages/tokens"
import { RouteProgress } from "@/components/route-progress"

type MappedRoute = {
  path: string
  title: string
}

const protectedRoutes: MappedRoute[] = [
  { path: "/servers", title: "Servers" },
  { path: "/server/create", title: "Create Server" },
  { path: "/server/edit", title: "Edit Server" },
  { path: "/serverviewer", title: "Server Viewer" },
  { path: "/chat", title: "Chat" },
  { path: "/chat/:cid", title: "Chat" },
  { path: "/files", title: "Files" },
  { path: "/file/upload/:cid", title: "Upload File" },
  { path: "/logs", title: "Logs" },
  { path: "/snapshot", title: "Snapshot" },
  { path: "/console", title: "Console" },
  { path: "/tokens", title: "Tokens" },
  { path: "/token/add", title: "Add Token" },
  { path: "/apikeys", title: "API Keys" },
  { path: "/apikey/add", title: "Add API Key" },
  { path: "/bans", title: "Bans" },
  { path: "/ban/add", title: "Add Ban" },
  { path: "/ban/:banid/edit", title: "Edit Ban" },
  { path: "/complaints", title: "Complaints" },
  { path: "/clients", title: "Clients" },
  { path: "/client/:cldbid/ban", title: "Ban Client" },
  { path: "/client/:clid/edit", title: "Edit Client" },
  { path: "/servergroups", title: "Server Groups" },
  { path: "/servergroup/:sgid/edit", title: "Edit Server Group" },
  { path: "/channelgroups", title: "Channel Groups" },
  { path: "/channelgroup/:cgid/edit", title: "Edit Channel Group" },
  { path: "/channel/:cid/edit", title: "Edit Channel" },
  { path: "/channel/add", title: "Add Channel" },
  { path: "/spacer/add", title: "Add Spacer" },
  { path: "/permissions/client", title: "Client Permissions" },
  { path: "/permissions/client/:cldbid", title: "Client Permissions" },
  { path: "/permissions/servergroup", title: "Server Group Permissions" },
  { path: "/permissions/servergroup/:sgid", title: "Server Group Permissions" },
  {
    path: "/permissions/channel/:cid/client/:cldbid",
    title: "Channel Client Permissions",
  },
  { path: "/permissions/channel/client", title: "Channel Client Permissions" },
  { path: "/permissions/channel", title: "Channel Permissions" },
  { path: "/permissions/channel/:cid", title: "Channel Permissions" },
  { path: "/permissions/channelgroup", title: "Channel Group Permissions" },
  {
    path: "/permissions/channelgroup/:cgid",
    title: "Channel Group Permissions",
  },
]

export function AppRoutes() {
  return (
    <>
    <RouteProgress />
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/server/edit" element={<ServerEdit />} />
          <Route path="/serverviewer" element={<ServerViewerPage />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:cid" element={<Chat />} />
          <Route path="/files" element={<Files />} />
          <Route path="/file/upload/:cid" element={<FileUpload />} />
          <Route path="/snapshot" element={<Snapshot />} />
          <Route path="/console" element={<Console />} />
          <Route path="/tokens" element={<Tokens />} />
          <Route path="/channel/add" element={<ChannelForm mode="add" />} />
          <Route path="/channel/:cid/edit" element={<ChannelForm mode="edit" />} />
          <Route path="/client/:cldbid/ban" element={<ClientBan />} />
          <Route path="/client/:clid/edit" element={<ClientEdit />} />
          <Route path="/spacer/add" element={<SpacerAdd />} />
          <Route path="/permissions/client" element={<ClientPermissions />} />
          <Route path="/permissions/client/:cldbid" element={<ClientPermissions />} />
          <Route path="/permissions/servergroup" element={<ServerGroupPermissions />} />
          <Route path="/permissions/servergroup/:sgid" element={<ServerGroupPermissions />} />
          <Route path="/permissions/channel" element={<ChannelPermissions />} />
          <Route path="/permissions/channel/:cid" element={<ChannelPermissions />} />
          <Route path="/permissions/channel/client" element={<ChannelClientPermissions />} />
          <Route path="/permissions/channel/:cid/client/:cldbid" element={<ChannelClientPermissions />} />
          <Route path="/permissions/channelgroup" element={<ChannelGroupPermissions />} />
          <Route path="/permissions/channelgroup/:cgid" element={<ChannelGroupPermissions />} />
          {protectedRoutes
            .filter(
              (route) =>
                route.path !== "/servers" &&
                route.path !== "/server/edit" &&
                route.path !== "/serverviewer" &&
                route.path !== "/logs" &&
                route.path !== "/chat" &&
                route.path !== "/chat/:cid" &&
                route.path !== "/files" &&
                route.path !== "/file/upload/:cid" &&
                route.path !== "/snapshot" &&
                route.path !== "/console" &&
                route.path !== "/tokens" &&
                route.path !== "/channel/add" &&
                route.path !== "/channel/:cid/edit" &&
                route.path !== "/client/:cldbid/ban" &&
                route.path !== "/client/:clid/edit" &&
                route.path !== "/spacer/add" &&
                route.path !== "/permissions/client" &&
                route.path !== "/permissions/client/:cldbid" &&
                route.path !== "/permissions/servergroup" &&
                route.path !== "/permissions/servergroup/:sgid" &&
                route.path !== "/permissions/channel" &&
                route.path !== "/permissions/channel/:cid" &&
                route.path !== "/permissions/channel/client" &&
                route.path !== "/permissions/channel/:cid/client/:cldbid" &&
                route.path !== "/permissions/channelgroup" &&
                route.path !== "/permissions/channelgroup/:cgid"
            )
            .map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={<PlaceholderPage title={route.title} />}
              />
            ))}
          <Route path="/logout" element={<LogoutPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  )
}
