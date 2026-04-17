"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronDown,
  ClipboardList,
  FileText,
  Settings,
  LogOut,
  Menu,
  Package,
  AlertTriangle,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isManagementRole } from "@/lib/user-roles";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const secondaryNavItems = [
  { label: "Журналы", href: "/journals", icon: ClipboardList },
  { label: "Партии", href: "/batches", icon: Package },
  { label: "CAPA", href: "/capa", icon: AlertTriangle },
  { label: "Отчёты", href: "/reports", icon: FileText },
  { label: "Настройки", href: "/settings", icon: Settings },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * "Волкова Анна Дмитриевна" → "Волкова А. Д."
 * Preserves single-word names, trims extra whitespace.
 */
function shortenPersonName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [last, ...rest] = parts;
  const initials = rest
    .slice(0, 2)
    .map((p) => `${p[0].toLocaleUpperCase("ru-RU")}.`)
    .join(" ");
  return initials ? `${last} ${initials}` : last;
}

type HeaderProps = {
  userName: string;
  userEmail: string;
  organizationName: string;
  userRole: string;
  positionTitle: string;
  isRoot: boolean;
};

export function Header({
  userName,
  userEmail,
  organizationName,
  userRole,
  positionTitle,
  isRoot,
}: HeaderProps) {
  const pathname = usePathname();
  const [buildInfo, setBuildInfo] = useState({
    buildId: "...",
    buildTime: "",
  });

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function syncBuildInfo() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/build-info?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (!data?.buildId || cancelled) return;

        setBuildInfo({
          buildId: data.buildId,
          buildTime: data.buildTime || "",
        });
      } catch {
        // silent
      } finally {
        inFlight = false;
      }
    }

    void syncBuildInfo();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncBuildInfo();
      }
    };
    window.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  // First slot: company name for managers/root, "Фамилия И.О. · должность"
  // for regular employees. Falls back to "Дашборд" if we somehow lack both.
  const showsOrg = isRoot || isManagementRole(userRole);
  const employeeLabelShort = (() => {
    const name = shortenPersonName(userName);
    const title = positionTitle.trim();
    if (name && title) return `${name} · ${title}`;
    return name || title || "Дашборд";
  })();
  const homeLabel = showsOrg
    ? organizationName || "Дашборд"
    : employeeLabelShort;
  const homeTooltip = showsOrg
    ? organizationName
    : [userName.trim(), positionTitle.trim()].filter(Boolean).join(" · ");
  const HomeIcon = showsOrg ? Building2 : UserRound;
  const navItems = [
    { label: homeLabel, href: "/dashboard", icon: HomeIcon, tooltip: homeTooltip },
    ...secondaryNavItems.map((i) => ({ ...i, tooltip: i.label })),
  ];

  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="flex h-14 items-center gap-4 px-4 md:px-6">
        <Link href="/dashboard" className="shrink-0 flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-primary">HACCP-Online</span>
          <span
            className="text-[10px] font-mono text-muted-foreground/60"
            title={`Build: ${buildInfo.buildTime}`}
          >
            {buildInfo.buildId}
          </span>
        </Link>

        {/*
          Desktop: only the home pill is visible. Secondary nav lives in a
          hover/focus-within dropdown that anchors to the pill. Click on the
          pill goes to /dashboard (native <Link> navigation), hover/keyboard
          focus reveals the rest. The wrapper covers trigger + panel as a
          single box so the pointer doesn't fall through the gap.
        */}
        <div className="hidden min-w-0 flex-1 items-center md:flex">
          <div className="group/nav relative">
            <Link
              href="/dashboard"
              title={homeTooltip}
              className={cn(
                "relative z-10 flex min-w-0 max-w-[280px] items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === "/dashboard"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground group-hover/nav:bg-accent group-hover/nav:text-accent-foreground group-focus-within/nav:bg-accent group-focus-within/nav:text-accent-foreground"
              )}
            >
              <HomeIcon className="size-4 shrink-0" />
              <span className="truncate">{homeLabel}</span>
              <ChevronDown
                className="size-3.5 shrink-0 opacity-60 transition-transform duration-150 group-hover/nav:rotate-180 group-focus-within/nav:rotate-180"
                aria-hidden
              />
            </Link>

            <div
              role="menu"
              className="pointer-events-none invisible absolute left-0 top-full z-20 w-[260px] translate-y-[-4px] rounded-xl border bg-white p-1.5 opacity-0 shadow-[0_10px_32px_-12px_rgba(11,16,36,0.18)] transition-[opacity,transform] duration-150 group-hover/nav:pointer-events-auto group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100 group-focus-within/nav:pointer-events-auto group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100"
            >
              {secondaryNavItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex-1" />
        </div>

        <div className="flex-1 md:hidden" />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="size-5" />
              <span className="sr-only">Меню</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="top" className="p-4">
            <SheetTitle className="sr-only">Навигация</SheetTitle>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar>
                <AvatarFallback>{getInitials(userName)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {userEmail}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 size-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
