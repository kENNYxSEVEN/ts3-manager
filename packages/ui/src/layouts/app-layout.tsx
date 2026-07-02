import { NavLink, Outlet, useLocation } from "react-router-dom"
import {
  Ban,
  Blocks,
  ChevronRight,
  ClipboardList,
  Code2,
  Database,
  Eye,
  FileArchive,
  FileKey2,
  Folder,
  KeyRound,
  LogOut,
  MessageSquare,
  MonitorCog,
  ShieldCheck,
  TerminalSquare,
  Users,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type NavItem = {
  title: string
  path: string
  icon: LucideIcon
}

const mainNavigation: NavItem[] = [
  { title: "Servers", path: "/servers", icon: Database },
  { title: "Server Viewer", path: "/serverviewer", icon: Eye },
  { title: "Chat", path: "/chat", icon: MessageSquare },
  { title: "Files", path: "/files", icon: Folder },
  { title: "Logs", path: "/logs", icon: ClipboardList },
  { title: "Snapshot", path: "/snapshot", icon: FileArchive },
  { title: "Console", path: "/console", icon: TerminalSquare },
  { title: "Tokens", path: "/tokens", icon: KeyRound },
  { title: "API Keys", path: "/apikeys", icon: FileKey2 },
  { title: "Bans", path: "/bans", icon: Ban },
  { title: "Complaints", path: "/complaints", icon: ShieldCheck },
  { title: "Clients", path: "/clients", icon: Users },
  { title: "Server Groups", path: "/servergroups", icon: Blocks },
  { title: "Channel Groups", path: "/channelgroups", icon: MonitorCog },
]

const permissionNavigation: NavItem[] = [
  {
    title: "Server Group Permissions",
    path: "/permissions/servergroup",
    icon: Users,
  },
  { title: "Client Permissions", path: "/permissions/client", icon: Users },
  {
    title: "Channel Permissions",
    path: "/permissions/channel",
    icon: Blocks,
  },
  {
    title: "Channel Group Permissions",
    path: "/permissions/channelgroup",
    icon: MonitorCog,
  },
  {
    title: "Channel Client Permissions",
    path: "/permissions/channel/client",
    icon: Code2,
  },
]

function isChannelClientPath(path: string) {
  return /^\/permissions\/channel\/(client|[^/]+\/client)(\/|$)/.test(path)
}

function isActivePath(currentPath: string, itemPath: string) {
  if (itemPath === "/permissions/channel/client") {
    return isChannelClientPath(currentPath)
  }

  if (itemPath === "/permissions/channel" && isChannelClientPath(currentPath)) {
    return false
  }

  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}

function NavItemLink({ item, compact = false }: { item: NavItem; compact?: boolean }) {
  const location = useLocation()
  const active = isActivePath(location.pathname, item.path)
  const Icon = item.icon

  return (
    <Button
      asChild
      variant={active ? "secondary" : "ghost"}
      className={cn(
        "h-9 w-full justify-start gap-2 px-2.5",
        compact && "h-8 w-auto shrink-0 px-3",
        active && "font-semibold",
      )}
    >
      <NavLink to={item.path}>
        <Icon className="size-4" />
        <span>{item.title}</span>
      </NavLink>
    </Button>
  )
}

function NavigationSection({
  items,
  label,
}: {
  items: NavItem[]
  label?: string
}) {
  return (
    <div className="space-y-1">
      {label ? (
        <div className="px-2.5 pb-1 pt-3 text-xs font-medium uppercase tracking-normal text-muted-foreground">
          {label}
        </div>
      ) : null}
      {items.map((item) => (
        <NavItemLink item={item} key={item.path} />
      ))}
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r bg-card text-card-foreground lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Database className="size-4" />
        </div>
        <div>
          <div className="text-base font-semibold leading-tight">TS3 Manager</div>
          <div className="text-xs text-muted-foreground">ServerQuery console</div>
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-3 py-3">
        <NavigationSection items={mainNavigation} />
        <Separator className="my-3" />
        <NavigationSection items={permissionNavigation} label="Permissions" />
        <Separator className="my-3" />
        <NavItemLink item={{ title: "Logout", path: "/logout", icon: LogOut }} />
      </ScrollArea>
    </aside>
  )
}

function MobileNavigation() {
  return (
    <div className="border-b bg-background lg:hidden">
      <ScrollArea className="w-full">
        <div className="flex gap-1 px-3 py-2">
          {[...mainNavigation, ...permissionNavigation].map((item) => (
            <NavItemLink compact item={item} key={item.path} />
          ))}
          <NavItemLink
            compact
            item={{ title: "Logout", path: "/logout", icon: LogOut }}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

export function AppLayout() {
  const location = useLocation()
  const currentItem =
    [...mainNavigation, ...permissionNavigation].find((item) =>
      isActivePath(location.pathname, item.path),
    ) ?? mainNavigation[0]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground lg:hidden">
                <Database className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-base font-semibold">TS3 Manager</h1>
                  <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                  <span className="hidden truncate text-sm text-muted-foreground sm:block">
                    {currentItem.title}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  TeamSpeak ServerQuery management
                </p>
              </div>
            </div>
            <Badge variant="outline">Connected</Badge>
          </header>
          <MobileNavigation />
          <main className="flex-1 p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
