"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, FolderKanban, LayoutDashboard, LogOut, Server, Settings, UserRound, Workflow, Zap } from "lucide-react";
import { CommandPalette } from "./command-palette";
import { logout } from "@/actions";
import type { ReactNode } from "react";
import { useStatus } from "./status-provider";
import { Dot, IconButton, cx } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, online } = useStatus();
  const runningContainers = Object.values(status.runtimes).reduce(
    (total, runtime) => total + runtime.containers.filter((container) => container.state === "running").length,
    0,
  );

  const nav = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, count: null, active: pathname === "/" },
    { href: "/projects", label: "Projects", icon: FolderKanban, count: status.projects.length, active: pathname.startsWith("/projects") },
    { href: "/services", label: "Services", icon: Boxes, count: runningContainers, active: pathname === "/services" },
    { href: "/servers", label: "Servers", icon: Server, count: null, active: pathname === "/servers" },
    { href: "/pipelines", label: "Pipelines", icon: Workflow, count: null, active: pathname === "/pipelines" },
    { href: "/settings", label: "Settings", icon: Settings, count: null, active: pathname === "/settings" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden lg:flex">
      <aside className="border-b border-line bg-panel px-3 py-3 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-[224px] lg:flex-col lg:border-b-0 lg:border-r lg:py-4">
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid size-7 place-items-center rounded-lg bg-[#0f2f2b]">
            <svg viewBox="0 0 64 64" className="size-5" aria-hidden="true">
              <path d="M20 44 L32 16 L44 44" fill="none" stroke="#2dd4bf" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M25 36 H39" stroke="#2dd4bf" strokeWidth="6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[14px] font-semibold tracking-tight">DevLaunch</span>
          <span className="ml-auto lg:hidden">
            <Dot tone={online ? "success" : "danger"} />
          </span>
        </div>

        <nav className="nav-scroll -mx-3 mt-3 flex gap-1 overflow-x-auto px-3 lg:mx-0 lg:mt-6 lg:flex-col lg:overflow-visible lg:px-0" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition",
                item.active ? "bg-panel-2 text-ink" : "text-ink-dim hover:bg-white/[0.04] hover:text-ink",
              )}
            >
              <item.icon className={cx("size-4", item.active && "text-accent")} />
              {item.label}
              {item.count !== null && <span className="ml-auto text-[11px] tabular-nums text-ink-faint">{item.count}</span>}
            </Link>
          ))}
        </nav>

        <div className="mt-auto hidden lg:block">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]">
            <UserRound className="size-3.5 text-ink-dim" />
            <span className="truncate text-ink">{status.user.username}</span>
            <IconButton
              label="Sign out"
              className="ml-auto size-7"
              onClick={async () => {
                await logout();
                router.push("/");
                router.refresh();
              }}
            >
              <LogOut className="size-3.5" />
            </IconButton>
          </div>
          <div className="rounded-lg border border-line bg-bg p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <Zap className="size-3.5 text-accent" /> This Mac
              <Dot tone={online ? "success" : "danger"} />
            </div>
            <dl className="mt-2 space-y-1 text-[11px] text-ink-dim">
              <div className="flex justify-between">
                <dt>App</dt>
                <dd className={online ? "text-success" : "text-danger"}>{online ? "Online" : "Unreachable"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Docker</dt>
                <dd className={status.dockerAvailable ? "text-success" : "text-warn"}>{status.dockerAvailable ? "Ready" : "Not running"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>

      <CommandPalette />

      <main className="flex-1 lg:pl-[224px]">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
