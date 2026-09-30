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
  BookOpen,
  Menu,
  X,
  Building2,
  HardHat,
  Gauge,
  IndianRupee,
  Package,
  Banknote,
  FileText,
  ShieldCheck,
  Compass,
  Landmark,
  type LucideIcon,
  ChevronDown,
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
import { useT } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/language-switch";

// The handful of places staff actually go on a phone. Everything else lives behind
// "More", which opens the same drawer the desktop sidebar shows.
const MOBILE_TABS: NavItem[] = [
  { href: "/dashboard", label: "Home", key: "tab.home", icon: LayoutDashboard },
  { href: "/shifts", label: "Shifts", key: "tab.shifts", icon: ClipboardList },
  { href: "/cash", label: "Cash", key: "tab.cash", icon: Banknote, anyPerm: ["canEditCollections", "canManageBankAndSettlement"] },
  { href: "/reports", label: "Reports", key: "tab.reports", icon: BarChart3, anyPerm: ["canViewReports"] },
];

/**
 * A nav item is hidden when the signed-in user holds none of `anyPerm`. This is a
 * courtesy, not the control — every route is enforced server-side — so anything
 * whose mapping is not obvious (the dashboard, shift reports, wet stock) carries no
 * `anyPerm` and stays visible for everyone.
 */
type NavItem = {
  href: string;
  label: string;
  key: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  anyPerm?: string[];
};

function visibleTo(user: ApiUser) {
  return (item: NavItem) => {
    if (item.ownerOnly && user.role !== "OWNER") return false;
    if (!item.anyPerm) return true;
    // An owner passes every check, and a user whose permissions have not loaded
    // keeps the full menu rather than an empty one.
    if (user.role === "OWNER" || !user.permissions) return true;
    return item.anyPerm.some((p) => user.permissions?.[p]);
  };
}

type NavGroup = { key: string; label: string; items: NavItem[] };

// Grouped the way a pump owner thinks about the work, not the way the screens were
// built. "Users & Roles" is named for what people look for — the role editor was
// previously hiding behind a bare "Users".
const NAV_GROUPS: NavGroup[] = [
  {
    key: "navgroup.daily",
    label: "Daily work",
    items: [
      { href: "/dashboard", label: "Dashboard", key: "nav.dashboard", icon: LayoutDashboard },
      { href: "/shifts", label: "Shift Reports", key: "nav.shifts", icon: ClipboardList },
      { href: "/wet-stock", label: "Wet Stock & Testing", key: "nav.wetStock", icon: Gauge },
      { href: "/tanker-receipts", label: "Tanker Receipts", key: "nav.tankers", icon: Truck, anyPerm: ["canEditTankerReceipts", "canEditStock"] },
    ],
  },
  {
    key: "navgroup.sales",
    label: "Sales & customers",
    items: [
      { href: "/credit", label: "Credit Customers", key: "nav.credit", icon: Wallet, anyPerm: ["canManageCreditCustomers", "canEditCreditSales"] },
      { href: "/receivables", label: "Statements & Cheques", key: "nav.receivables", icon: FileText, anyPerm: ["canManageCreditCustomers", "canViewBooks"] },
      { href: "/products", label: "Lubes & Non-Fuel", key: "nav.products", icon: Package, anyPerm: ["canManageProducts"] },
      { href: "/rates", label: "Fuel Rates", key: "nav.rates", icon: Fuel, anyPerm: ["canEditFuelRates"] },
      { href: "/pricing", label: "Price Revisions", key: "nav.pricing", icon: IndianRupee, anyPerm: ["canEditFuelRates"] },
    ],
  },
  {
    key: "navgroup.finance",
    label: "Finance",
    items: [
      { href: "/cash", label: "Cash & Bank", key: "nav.cash", icon: Banknote, anyPerm: ["canEditCollections", "canManageBankAndSettlement"] },
      { href: "/books", label: "Books (Ledger)", key: "nav.books", icon: BookOpen, anyPerm: ["canViewBooks"] },
      { href: "/opening-balances", label: "Opening Balances", key: "nav.opening", icon: Landmark, anyPerm: ["canViewBooks"] },
      { href: "/expenses", label: "Expense Categories", key: "nav.expenses", icon: Tags, anyPerm: ["canManageExpenseCategories"] },
      { href: "/reports", label: "Reports", key: "nav.reports", icon: BarChart3, anyPerm: ["canViewReports"] },
    ],
  },
  {
    key: "navgroup.people",
    label: "Staff",
    items: [
      { href: "/employees", label: "Employees", key: "nav.employees", icon: HardHat, anyPerm: ["canManageEmployees"] },
      { href: "/compliance", label: "Compliance & Staff", key: "nav.compliance", icon: ShieldCheck, anyPerm: ["canManageLicences", "canManageEmployees"] },
      { href: "/settings/users", label: "Users & Roles", key: "nav.users", icon: Users, anyPerm: ["canManageUsers"] },
    ],
  },
  {
    key: "navgroup.setup",
    label: "Setup",
    items: [
      { href: "/guide", label: "Setup Guide", key: "nav.guide", icon: Compass },
      { href: "/settings/pump", label: "Pump Setup", key: "nav.pumpSetup", icon: Settings, anyPerm: ["canManagePump"] },
      { href: "/settings/pumps", label: "Manage Pumps", key: "nav.managePumps", icon: Building2, ownerOnly: true },
    ],
  },
];

// Flat list, still used for the "which section am I in" lookup and the tab bar.
const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
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

  const current = NAV.find(
    (n) => pathname === n.href || pathname.startsWith(n.href + "/")
  );
  const currentLabel = current ? t(current.key, current.label) : "FuelBook";

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Mobile top bar */}
      <header
        className="md:hidden sticky z-30 flex items-center justify-between gap-2 border-b bg-white px-3 py-2.5"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        {/* Burger in the left corner opens the full menu — the bottom tabs only
            carry the four most-used sections. */}
        <button
          aria-label={t("nav.openMenu", "Open menu")}
          onClick={() => setNavOpen(true)}
          className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-slate-100 active:bg-slate-200"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
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
          {t(`settings.role${user.role}`, user.role)}
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
            style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
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
            <SidebarNav pathname={pathname} user={user} onNavigate={() => setNavOpen(false)} />
            <SidebarFooter user={user} onLogout={logout} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <main className="flex-1 min-w-0 md:overflow-auto">
        {/* pb-24 on phones keeps the last row clear of the tab bar */}
        <div className="p-3 sm:p-4 md:p-6 pb-24 md:pb-6 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>

      <MobileTabBar pathname={pathname} user={user} onMore={() => setNavOpen(true)} moreOpen={navOpen} />
    </div>
  );
}

/**
 * Bottom tab bar for phones. Navigation belongs within thumb reach on a device being
 * used one-handed at the forecourt, and the bar sits above the iPhone home indicator
 * via the safe-area inset (which is 0 everywhere else).
 */
function MobileTabBar({
  pathname,
  user,
  onMore,
  moreOpen,
}: {
  pathname: string;
  user: ApiUser;
  onMore: () => void;
  moreOpen: boolean;
}) {
  const { t } = useT();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const tabs = MOBILE_TABS.filter(visibleTo(user));
  // A section that is not one of the tabs is still "somewhere", so More owns it.
  const otherActive = !moreOpen && !tabs.some((item) => isActive(item.href));

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              <span className="leading-none">{t(item.key, item.label)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
            moreOpen || otherActive
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Menu className={cn("h-5 w-5", (moreOpen || otherActive) && "stroke-[2.5]")} />
          <span className="leading-none">{t("tab.more", "More")}</span>
        </button>
      </div>
    </nav>
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

const GROUP_STATE_KEY = "fuelbook.nav.collapsed";

/** Which groups the user has collapsed, remembered per device. */
function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GROUP_STATE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      // Storage blocked or corrupt — everything simply starts expanded.
    }
  }, []);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        window.localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(next));
      } catch {
        // Not remembering the choice is not a reason to refuse it.
      }
      return next;
    });

  return { collapsed, toggle };
}

function SidebarNav({
  pathname,
  user,
  onNavigate,
}: {
  pathname: string;
  user: ApiUser;
  onNavigate?: () => void;
}) {
  const { t } = useT();
  const { collapsed, toggle } = useCollapsedGroups();
  const can = visibleTo(user);
  // A group with nothing the user may open is dropped entirely, so a cashier does
  // not see an empty "Finance" heading.
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(can) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <nav className="flex-1 p-2 space-y-2 overflow-y-auto">
      {groups.map((group) => {
        // A collapsed group still opens itself when you are inside it, so the
        // current page is never hidden behind a closed heading.
        const hasActive = group.items.some(
          (n) => pathname === n.href || pathname.startsWith(n.href + "/")
        );
        const isOpen = !collapsed.includes(group.key) || hasActive;
        return (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => toggle(group.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-slate-100"
            >
              <span className="truncate">{t(group.key, group.label)}</span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !isOpen && "-rotate-90")}
              />
            </button>
            {isOpen && (
              <div className="mt-0.5 space-y-1">
                {group.items.map((n) => {
                  const active = pathname === n.href || pathname.startsWith(n.href + "/");
                  const Icon = n.icon;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t(n.key, n.label)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
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
  const { t } = useT();
  return (
    <div className="p-3 border-t">
      <LanguageSwitch className="mb-3 justify-between" />
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
          {t(`settings.role${user.role}`, user.role)}
        </Badge>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onLogout}>
        <LogOut className="h-4 w-4 mr-2" /> {t("common.signOut", "Sign out")}
      </Button>
    </div>
  );
}
