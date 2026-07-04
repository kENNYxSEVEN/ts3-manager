import { Navigate, Route, Routes } from "react-router-dom"

import { ProtectedRoute } from "@/auth/protected-route"
import { AppLayout } from "@/layouts/app-layout"
import { ChannelForm } from "@/pages/channel-form"
import { Chat } from "@/pages/chat"
import { ClientBan } from "@/pages/client-ban"
import { ClientEdit } from "@/pages/client-edit"
import { LoginPage } from "@/pages/login"
import { LogoutPage } from "@/pages/logout"
import { PlaceholderPage } from "@/pages/placeholder"
import { ServerViewerPage } from "@/pages/server-viewer"
import { ServersPage } from "@/pages/servers"
import { SpacerAdd } from "@/pages/spacer-add"
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
          <Route path="/serverviewer" element={<ServerViewerPage />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:cid" element={<Chat />} />
          <Route path="/channel/add" element={<ChannelForm mode="add" />} />
          <Route path="/channel/:cid/edit" element={<ChannelForm mode="edit" />} />
          <Route path="/client/:cldbid/ban" element={<ClientBan />} />
          <Route path="/client/:clid/edit" element={<ClientEdit />} />
          <Route path="/spacer/add" element={<SpacerAdd />} />
          {protectedRoutes
            .filter(
              (route) =>
                route.path !== "/servers" &&
                route.path !== "/serverviewer" &&
                route.path !== "/chat" &&
                route.path !== "/chat/:cid" &&
                route.path !== "/channel/add" &&
                route.path !== "/channel/:cid/edit" &&
                route.path !== "/client/:cldbid/ban" &&
                route.path !== "/client/:clid/edit" &&
                route.path !== "/spacer/add",
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
