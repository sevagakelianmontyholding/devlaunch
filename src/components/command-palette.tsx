"use client";

import { Boxes, Code2, FolderKanban, LayoutDashboard, Power, Rocket, Search, Server, Settings, TerminalSquare, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { openProject, openProjectTerminal, runCompose } from "@/actions";
import { useNavigate } from "./navigate";
import { useStatus } from "./status-provider";
import { cx } from "./ui";

type Item = { id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };

export function CommandPalette() {
  const { status, refresh, notify } = useStatus();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        setQuery("");
        setIndex(0);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      { id: "page:dashboard", label: "Go to Dashboard", icon: <LayoutDashboard className="size-4" />, run: () => navigate("/") },
      { id: "page:projects", label: "Go to Projects", icon: <FolderKanban className="size-4" />, run: () => navigate("/projects") },
      { id: "page:services", label: "Go to Services", icon: <Boxes className="size-4" />, run: () => navigate("/services") },
      { id: "page:servers", label: "Go to Servers", icon: <Server className="size-4" />, run: () => navigate("/servers") },
      { id: "page:pipelines", label: "Go to Pipelines", icon: <Workflow className="size-4" />, run: () => navigate("/pipelines") },
      { id: "page:settings", label: "Go to Settings", icon: <Settings className="size-4" />, run: () => navigate("/settings") },
    ];
    for (const project of status.projects) {
      const runtime = status.runtimes[project.id];
      list.push({ id: `open:${project.id}`, label: project.name, hint: "Open project", icon: <FolderKanban className="size-4 text-accent" />, run: () => navigate(`/projects/${project.id}`) });
      if (project.composeFile || project.commands.start) {
        const action = runtime?.running ? "stop" : "start";
        list.push({
          id: `${action}:${project.id}`,
          label: `${runtime?.running ? "Stop" : "Start"} ${project.name}`,
          hint: "Local",
          icon: <Power className={cx("size-4", runtime?.running ? "text-danger" : "text-success")} />,
          run: async () => {
            const result = await runCompose(project.id, action);
            notify(result.ok ? "success" : "error", result.ok ? `${runtime?.running ? "Stopping" : "Starting"} ${project.name}` : result.error);
            void refresh();
          },
        });
      }
      list.push({ id: `code:${project.id}`, label: `Open ${project.name} in VS Code`, icon: <Code2 className="size-4" />, run: () => void openProject(project.id) });
      list.push({ id: `term:${project.id}`, label: `Open ${project.name} in terminal`, icon: <TerminalSquare className="size-4" />, run: () => void openProjectTerminal(project.id) });
      if ((status.deployments[project.id] ?? []).length > 0) {
        list.push({ id: `deploy:${project.id}`, label: `Deploy ${project.name}`, hint: "Opens the project", icon: <Rocket className="size-4 text-accent" />, run: () => navigate(`/projects/${project.id}`) });
      }
    }
    const needle = query.trim().toLowerCase();
    return needle ? list.filter((item) => item.label.toLowerCase().includes(needle) || item.hint?.toLowerCase().includes(needle)) : list;
  }, [status, query, navigate, notify, refresh]);

  if (!open) return null;

  const choose = (item: Item) => {
    setOpen(false);
    item.run();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center px-4 pt-[12vh]">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fade-up relative w-full max-w-[560px] overflow-hidden rounded-card border border-line-strong bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((current) => Math.min(current + 1, items.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter" && items[index]) {
                event.preventDefault();
                choose(items[index]);
              }
            }}
            placeholder="Search projects and actions…"
            className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-ink-faint">No matches</li>}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(item)}
                className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px]", i === index ? "bg-panel-2 text-ink" : "text-ink-dim")}
              >
                {item.icon}
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && <span className="text-[11px] text-ink-faint">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-1.5 text-[10px] text-ink-faint">↑↓ navigate · ↵ run · ⌘K toggle</div>
      </div>
    </div>
  );
}
