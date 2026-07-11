"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Users,
  Settings,
  Tags,
  Fuel,
  LogOut,
  Truck,
  BarChart3,
  Menu,
  X,
  Building2,
  HardHat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ApiUser, clearAuth, getAuthUser, setAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shifts", label: "Shift Reports", icon: ClipboardList },
  { href: "/employees", label: "Employees", icon: HardHat },
  { href: "/credit", label: "Credit Customers", icon: Wallet },
  { href: "/tanker-receipts", label: "Tanker Receipts", icon: Truck },
  { href: "/expenses", label: "Expense Categories", icon: Tags },
  { href: "/rates", label: "Fuel Rates", icon: Fuel },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings/users", label: "Users", icon: Users },
  { href: "/settings/pump", label: "Pump Setup", icon: Settings },
  { href: "/settings/pumps", label: "Manage Pumps", icon: Building2, ownerOnly: true },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const u = getAuthUser();
    if (!u) {
      router.replace("/login");
    } else {
      setUser(u);
    }
  }, [router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (!user) return null;

  const logout = () => {
    clearAuth();
    router.push("/login");
  };

  const currentLabel =
    NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
      ?.label || "FuelBook";

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-white px-3 py-2.5">
        <button
          aria-label="Open menu"
          onClick={() => setNavOpen(true)}
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-primary text-primary-foreground rounded-md p-1.5">
            <Fuel className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">
              {currentLabel}
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight truncate">
              {user.pumpName || "Pump"}
            </div>
          </div>
        </div>
        <Badge
          variant={user.role === "OWNER" ? "default" : "secondary"}
          className="text-[10px]"
        >
          {user.role}
        </Badge>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 lg:w-64 shrink-0 bg-white border-r flex-col">
        <SidebarBranding user={user} />
        <SidebarNav pathname={pathname} user={user} />
        <SidebarFooter user={user} onLogout={logout} />
      </aside>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={navOpen} onOpenChange={setNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-40 bg-black/40 md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-lg md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left"
          >
            <DialogPrimitive.Title className="sr-only">
              Navigation
            </DialogPrimitive.Title>
            <div className="flex items-center justify-between border-b">
              <SidebarBranding user={user} className="flex-1" />
              <button
                aria-label="Close menu"
                onClick={() => setNavOpen(false)}
                className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav pathname={pathname} user={user} />
            <SidebarFooter user={user} onLogout={logout} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <main className="flex-1 min-w-0 md:overflow-auto">
        <div className="p-3 sm:p-4 md:p-6 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarBranding({
  user,
  className,
}: {
  user: ApiUser;
  className?: string;
}) {
  const { data: pumps = [] } = useQuery({
    queryKey: ["setup-pumps"],
    queryFn: async () => (await api.get("/api/setup/pumps")).data,
    enabled: user.role === "OWNER",
  });

  const switchPump = async (pumpId: string) => {
    if (pumpId === user.pumpId) return;
    try {
      const { data } = await api.post("/api/auth/switch-pump", { pumpId });
      setAuth(data.token, {
        ...user,
        pumpId: data.user.pumpId,
        pumpName: data.user.pumpName,
      });
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to switch pump");
    }
  };

  return (
    <div className={cn("p-4 border-b", className)}>
      <div className="flex items-center gap-2">
        <div className="bg-primary text-primary-foreground rounded-lg p-2">
          <Fuel className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-none">FuelBook</div>
          {user.role === "OWNER" && pumps.length > 0 ? (
            <Select value={user.pumpId ?? undefined} onValueChange={switchPump}>
              <SelectTrigger className="h-6 mt-1 text-xs border-none px-0 shadow-none [&_svg]:h-3 [&_svg]:w-3">
                <SelectValue placeholder="Select pump" />
              </SelectTrigger>
              <SelectContent>
                {pumps.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {user.pumpName || "Pump"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarNav({ pathname, user }: { pathname: string; user: ApiUser }) {
  const items = NAV.filter((n) => !n.ownerOnly || user.role === "OWNER");
  return (
    <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
      {items.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({
  user,
  onLogout,
}: {
  user: ApiUser;
  onLogout: () => void;
}) {
  return (
    <div className="p-3 border-t">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{user.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {user.phone}
          </div>
        </div>
        <Badge
          variant={user.role === "OWNER" ? "default" : "secondary"}
          className="text-[10px]"
        >
          {user.role}
        </Badge>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onLogout}>
        <LogOut className="h-4 w-4 mr-2" /> Sign out
      </Button>
    </div>
  );
}
