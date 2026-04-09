"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Settings,
  LogOut,
  Menu,
  Package,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

const navItems = [
  { label: "Дашборд", href: "/dashboard", icon: LayoutDashboard },
  { label: "Журналы", href: "/journals", icon: ClipboardList },
  { label: "Партии", href: "/batches", icon: Package },
  { label: "CAPA", href: "/capa", icon: AlertTriangle },
  { label: "Отчёты", href: "/reports", icon: FileText },
  { label: "Настройки", href: "/settings", icon: Settings },
];

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CLIENT_BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type HeaderProps = {
  userName: string;
  userEmail: string;
  organizationName: string;
};

export function Header({ userName, userEmail, organizationName }: HeaderProps) {
  const pathname = usePathname();
  const [buildInfo, setBuildInfo] = useState({
    buildId: CLIENT_BUILD_ID,
    buildTime: CLIENT_BUILD_TIME,
  });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/build-info", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.buildId) {
          setBuildInfo({
            buildId: data.buildId,
            buildTime: data.buildTime || "",
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

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

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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

        <span className="hidden text-sm text-muted-foreground lg:inline">
          {organizationName}
        </span>

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
