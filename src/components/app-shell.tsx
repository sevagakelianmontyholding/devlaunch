"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, FolderKanban, Settings, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useStatus } from "./status-provider";
import { Dot, cx } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, online } = useStatus();
  const runningContainers = Object.values(status.runtimes).reduce(
    (total, runtime) => total + runtime.containers.filter((container) => container.state === "running").length,
    0,
  );

  const nav = [
    { href: "/", label: "Projects", icon: FolderKanban, count: status.projects.length, active: pathname === "/" || pathname.startsWith("/projects") },
    { href: "/services", label: "Services", icon: Boxes, count: runningContainers, active: pathname === "/services" },
    { href: "/settings", label: "Settings", icon: Settings, count: null, active: pathname === "/settings" },
  ];

  return (
    <div className="min-h-screen lg:flex">
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

        <nav className="mt-3 flex gap-1 lg:mt-6 lg:flex-col" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition",
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
