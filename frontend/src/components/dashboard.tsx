"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  Blocks,
  Boxes,
  Braces,
  ChevronDown,
  CircleDot,
  Command,
  Database,
  FolderKanban,
  Globe2,
  GitFork,
  Grid2X2,
  Keyboard,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  Settings,
  SquareTerminal,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { projectFromRegistry, type Project, type ProjectCategory } from "@/config/projects";
import type { ActivityEntry } from "@/types/activity";
import type {
  AgentProjectStatus,
  AgentStatusResponse,
  GitHubIntegrationStatus,
  ProxyManagerStatus,
  ProjectAction,
  ProjectActionResponse,
  RemoveProjectResponse,
} from "@/types/agent";
import { ProjectSection } from "./project-section";
import { CommandPalette } from "./command-palette";
import { ProjectDetailPage } from "./project-detail-page";
import { ProjectFormDialog } from "./add-project-dialog";

type SortMode = "status" | "recent" | "name";
type RecentProject = { id: string; usedAt: number };

const favoritesStorageKey = "devlaunch:favorites";
const recentStorageKey = "devlaunch:recent-projects";
const sortStorageKey = "devlaunch:sort";
const activityStorageKey = "devlaunch:activity";
const projectActions = new Set<ProjectAction>([
  "open-code",
  "start",
  "stop",
  "restart",
  "rebuild",
]);

const quickTools = [
  {
    name: "Terminal",
    detail: "Open workspace shell",
    shortcut: "T",
    icon: SquareTerminal,
    color: "text-violet-300",
    glow: "bg-violet-400",
  },
  {
    name: "Docker",
    detail: "Inspect local containers",
    shortcut: "D",
    icon: Boxes,
    color: "text-sky-300",
    glow: "bg-sky-400",
  },
  {
    name: "Database",
    detail: "Connect to services",
    shortcut: "B",
    icon: Database,
    color: "text-emerald-300",
    glow: "bg-emerald-400",
  },
  {
    name: "API Client",
    detail: "Test local endpoints",
    shortcut: "A",
    icon: Braces,
    color: "text-orange-300",
    glow: "bg-orange-400",
  },
];

const categories: Array<{
  id: "all" | ProjectCategory;
  label: string;
  icon: typeof Grid2X2;
}> = [
  { id: "all", label: "All projects", icon: Grid2X2 },
  { id: "work", label: "Work", icon: FolderKanban },
  { id: "personal", label: "Personal", icon: UserRound },
];

function discoveredLocalUrl(runtime: AgentProjectStatus) {
  const primaryDomain =
    runtime.domains.find(
      (domain) => domain.hostname.endsWith(".localhost") && domain.health?.healthy,
    ) ??
    runtime.domains.find((domain) => domain.hostname.endsWith(".localhost")) ??
    runtime.domains.find((domain) => domain.health?.healthy) ??
    runtime.domains[0];
  return primaryDomain?.url ?? runtime.localUrls[0];
}

export function Dashboard({ projects: initialProjects }: { projects: Project[] }) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ProjectCategory>("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("status");
  const [runtimeByProject, setRuntimeByProject] = useState<Record<string, AgentProjectStatus>>({});
  const [agentState, setAgentState] = useState<"checking" | "online" | "offline">("checking");
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [proxyManager, setProxyManager] = useState<ProxyManagerStatus | null>(null);
  const [githubIntegration, setGithubIntegration] = useState<GitHubIntegrationStatus | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [pendingProject, setPendingProject] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/projects/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Agent unavailable");
      const status = (await response.json()) as AgentStatusResponse;
      setRuntimeByProject(
        Object.fromEntries(status.projects.map((project) => [project.id, project])),
      );
      setProjects(status.registry.map(projectFromRegistry));
      setAgentState("online");
      setDockerAvailable(status.agent.dockerAvailable);
      setProxyManager(status.proxyManager);
      setGithubIntegration(status.github);
      setLastChecked(status.agent.checkedAt);
    } catch {
      setAgentState("offline");
      setDockerAvailable(false);
      setProxyManager(null);
      setGithubIntegration(null);
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void refreshStatus(), 0);
    const interval = window.setInterval(() => void refreshStatus(), 10_000);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [refreshStatus]);

  useEffect(() => {
    const hydratePreferences = window.setTimeout(() => {
      try {
        const storedFavorites = JSON.parse(
          window.localStorage.getItem(favoritesStorageKey) ?? "[]",
        ) as unknown;
        const storedRecent = JSON.parse(
          window.localStorage.getItem(recentStorageKey) ?? "[]",
        ) as unknown;
        const storedSort = window.localStorage.getItem(sortStorageKey);
        const storedActivity = JSON.parse(
          window.localStorage.getItem(activityStorageKey) ?? "[]",
        ) as unknown;

        if (Array.isArray(storedFavorites)) {
          setFavoriteIds(storedFavorites.filter((id): id is string => typeof id === "string"));
        }
        if (Array.isArray(storedRecent)) {
          setRecentProjects(
            storedRecent.filter(
              (entry): entry is RecentProject =>
                typeof entry === "object" &&
                entry !== null &&
                "id" in entry &&
                "usedAt" in entry &&
                typeof entry.id === "string" &&
                typeof entry.usedAt === "number",
            ),
          );
        }
        if (storedSort === "status" || storedSort === "recent" || storedSort === "name") {
          setSortMode(storedSort);
        }
        if (Array.isArray(storedActivity)) {
          setActivity(
            storedActivity.filter(
              (entry): entry is ActivityEntry =>
                typeof entry === "object" &&
                entry !== null &&
                "id" in entry &&
                "projectId" in entry &&
                "action" in entry &&
                "message" in entry &&
                "kind" in entry &&
                "createdAt" in entry &&
                typeof entry.id === "string" &&
                typeof entry.projectId === "string" &&
                typeof entry.action === "string" &&
                projectActions.has(entry.action as ProjectAction) &&
                typeof entry.message === "string" &&
                (entry.kind === "success" || entry.kind === "error") &&
                typeof entry.createdAt === "number",
            ),
          );
        }
      } catch {
        // Ignore malformed local preferences and keep safe defaults.
      }
    }, 0);

    return () => window.clearTimeout(hydratePreferences);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!notification) return;
    const timeout = window.setTimeout(() => setNotification(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [notification]);

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(id)
        ? current.filter((projectId) => projectId !== id)
        : [id, ...current];
      window.localStorage.setItem(favoritesStorageKey, JSON.stringify(next));
      return next;
    });
  }, []);

  const markProjectUsed = useCallback((id: string) => {
    setRecentProjects((current) => {
      const next = [{ id, usedAt: Date.now() }, ...current.filter((entry) => entry.id !== id)].slice(
        0,
        12,
      );
      window.localStorage.setItem(recentStorageKey, JSON.stringify(next));
      return next;
    });
  }, []);

  const recordActivity = useCallback(
    (projectId: string, action: ProjectAction, message: string, kind: "success" | "error") => {
      setActivity((current) => {
        const next: ActivityEntry[] = [
          {
            id: `${Date.now()}-${projectId}-${action}`,
            projectId,
            action,
            message,
            kind,
            createdAt: Date.now(),
          },
          ...current,
        ].slice(0, 60);
        window.localStorage.setItem(activityStorageKey, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const openProjectDetails = useCallback(
    (id: string) => {
      markProjectUsed(id);
      setSelectedProjectId(id);
      window.history.pushState(null, "", `?project=${encodeURIComponent(id)}`);
    },
    [markProjectUsed],
  );

  const closeProjectDetails = useCallback(() => {
    setSelectedProjectId(null);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Keep the detail page in sync with the URL so browser back/forward and
  // direct links like /?project=comium work.
  useEffect(() => {
    const applyLocation = () =>
      setSelectedProjectId(new URLSearchParams(window.location.search).get("project"));
    const initial = window.setTimeout(applyLocation, 0);
    window.addEventListener("popstate", applyLocation);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("popstate", applyLocation);
    };
  }, []);

  const closeAddProject = useCallback(() => setAddProjectOpen(false), []);

  const handleProjectAdded = useCallback(
    (project: AgentStatusResponse["registry"][number]) => {
      setProjects((current) => [
        ...current.filter((item) => item.id !== project.id),
        projectFromRegistry(project),
      ]);
      setCategory(project.category);
      setNotification({ kind: "success", message: `${project.name} was added to DevLaunch` });
      void refreshStatus();
    },
    [refreshStatus],
  );

  const liveProjects = useMemo(
    () =>
      projects.map((project) => {
        const runtime = runtimeByProject[project.id];
        if (!runtime) return project;

        return {
          ...project,
          status: runtime.exists
            ? runtime.docker.running
              ? ("running" as const)
              : ("idle" as const)
            : ("offline" as const),
          branch: runtime.git?.branch ?? project.branch,
          links: {
            ...project.links,
            local: project.links.local ?? discoveredLocalUrl(runtime),
          },
        };
      }),
    [projects, runtimeByProject],
  );

  const handleProjectUpdated = useCallback(
    (project: AgentStatusResponse["registry"][number]) => {
      setProjects((current) => [
        ...current.filter((item) => item.id !== project.id),
        projectFromRegistry(project),
      ]);
      setCategory(project.category);
      setNotification({ kind: "success", message: `${project.name} was updated` });
      setEditingProjectId(null);
      void refreshStatus();
    },
    [refreshStatus],
  );

  const handleProjectRemoved = useCallback(async (id: string) => {
    setPendingProject(id);
    setNotification(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as RemoveProjectResponse | { error?: string };
      if (!response.ok || !("ok" in result)) {
        throw new Error("error" in result && result.error ? result.error : "Could not remove project");
      }
      setProjects((current) => current.filter((project) => project.id !== id));
      setRuntimeByProject((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setFavoriteIds((current) => {
        const next = current.filter((projectId) => projectId !== id);
        window.localStorage.setItem(favoritesStorageKey, JSON.stringify(next));
        return next;
      });
      setRecentProjects((current) => {
        const next = current.filter((project) => project.id !== id);
        window.localStorage.setItem(recentStorageKey, JSON.stringify(next));
        return next;
      });
      setSelectedProjectId(null);
      setEditingProjectId(null);
      setNotification({ kind: "success", message: result.message });
    } catch (error) {
      setNotification({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not remove project",
      });
    } finally {
      setPendingProject(null);
    }
  }, []);

  const handleAction = useCallback(
    async (id: string, action: ProjectAction) => {
      markProjectUsed(id);
      setPendingProject(id);
      setNotification(null);

      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(id)}/action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const result = (await response.json()) as ProjectActionResponse | { error?: string };
        if (!response.ok) {
          throw new Error("error" in result && result.error ? result.error : "Action failed");
        }
        setNotification({
          kind: "success",
          message: (result as ProjectActionResponse).message,
        });
        recordActivity(
          id,
          action,
          (result as ProjectActionResponse).message,
          "success",
        );
        if (action !== "open-code") await refreshStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Action failed";
        setNotification({
          kind: "error",
          message,
        });
        recordActivity(id, action, message, "error");
      } finally {
        setPendingProject(null);
      }
    },
    [markProjectUsed, recordActivity, refreshStatus],
  );

  const recentRank = useMemo(
    () => new Map(recentProjects.map((project) => [project.id, project.usedAt])),
    [recentProjects],
  );

  const sortedProjects = useMemo(() => {
    const statusRank = { running: 0, idle: 1, offline: 2 } as const;
    return [...liveProjects].sort((left, right) => {
      if (sortMode === "name") return left.name.localeCompare(right.name);
      if (sortMode === "recent") {
        const recentDifference = (recentRank.get(right.id) ?? 0) - (recentRank.get(left.id) ?? 0);
        if (recentDifference !== 0) return recentDifference;
      }
      const statusDifference = statusRank[left.status] - statusRank[right.status];
      return statusDifference || left.name.localeCompare(right.name);
    });
  }, [liveProjects, recentRank, sortMode]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortedProjects.filter((project) => {
      const matchesCategory = category === "all" || project.category === category;
      const matchesQuery =
        !normalizedQuery ||
        [project.name, project.description, project.branch, ...project.stack]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [category, query, sortedProjects]);

  const workProjects = filteredProjects.filter((project) => project.category === "work");
  const personalProjects = filteredProjects.filter((project) => project.category === "personal");
  const favoriteProjects = filteredProjects.filter((project) => favoriteIdSet.has(project.id));
  const selectedProject = selectedProjectId
    ? liveProjects.find((project) => project.id === selectedProjectId)
    : undefined;
  const editingProject = editingProjectId
    ? projects.find((project) => project.id === editingProjectId)
    : undefined;
  const editingRuntime = editingProjectId ? runtimeByProject[editingProjectId] : undefined;
  const editingAutoLocalUrl = editingRuntime ? discoveredLocalUrl(editingRuntime) : undefined;
  const selectedProjectActivity = selectedProjectId
    ? activity.filter((entry) => entry.projectId === selectedProjectId)
    : [];
  const runningCount = liveProjects.filter((project) => project.status === "running").length;

  if (agentState === "checking") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#090a0d] text-zinc-100">
        <div className="dashboard-grid pointer-events-none fixed inset-0" />
        <div className="relative flex flex-col items-center">
          <div className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500 to-indigo-700 text-white shadow-[0_0_44px_rgba(124,108,255,0.35)]">
            <Command className="size-6" strokeWidth={2.2} />
          </div>
          <p className="mt-4 text-[15px] font-semibold tracking-[-0.02em] text-zinc-100">DevLaunch</p>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500">
            <LoaderCircle className="size-3.5 animate-spin text-violet-300" />
            Loading your workspace…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0d] text-zinc-100 selection:bg-violet-500/30">
      <div className="dashboard-grid pointer-events-none fixed inset-0" />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r border-white/[0.065] bg-[#0c0d10]/95 px-3.5 py-4 backdrop-blur-xl transition-transform duration-200 lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-9 items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="relative grid size-7 place-items-center overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-violet-500 to-indigo-700 text-white shadow-[0_0_22px_rgba(124,108,255,0.26)]">
              <Command className="size-4" strokeWidth={2.2} />
            </div>
            <span className="text-[14px] font-semibold tracking-[-0.02em] text-zinc-100">DevLaunch</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="mt-7" aria-label="Project filters">
          <p className="px-2 text-[12px] font-medium uppercase tracking-[0.13em] text-zinc-500">Workspace</p>
          <div className="mt-2 space-y-0.5">
            {categories.map((item) => {
              const Icon = item.icon;
              const count =
                item.id === "all"
                  ? projects.length
                  : projects.filter((project) => project.category === item.id).length;
              const isActive = category === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setCategory(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12px] transition ${isActive ? "bg-white/[0.07] text-zinc-100 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]" : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"}`}
                >
                  <Icon className="size-3.5" />
                  <span>{item.label}</span>
                  <span className="ml-auto text-[12px] text-zinc-500">{count}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="mt-7">
          <p className="px-2 text-[12px] font-medium uppercase tracking-[0.13em] text-zinc-500">System</p>
          <div className="mt-2 space-y-0.5">
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12px] text-zinc-500 transition hover:bg-white/[0.035] hover:text-zinc-300"
            >
              <Activity className="size-3.5" />
              Activity
            </button>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12px] text-zinc-500 transition hover:bg-white/[0.035] hover:text-zinc-300"
            >
              <Blocks className="size-3.5" />
              Services
              <span
                className={`ml-auto flex items-center gap-1 text-[12px] ${agentState === "online" ? "text-emerald-400/80" : "text-zinc-500"}`}
              >
                <span
                  className={`size-1 rounded-full ${agentState === "online" ? "bg-emerald-400" : "bg-zinc-700"}`}
                />
                {agentState === "online" ? runningCount : "—"}
              </span>
            </button>
            <a
              href={proxyManager?.dashboardUrl ?? "http://npm.localhost"}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12px] text-zinc-500 transition hover:bg-white/[0.035] hover:text-zinc-300"
            >
              <Globe2 className="size-3.5" />
              Proxy hosts
              <span
                className={`ml-auto flex items-center gap-1 text-[12px] ${proxyManager?.available ? proxyManager.healthyCount === proxyManager.hostCount ? "text-emerald-400/80" : "text-amber-300/80" : "text-zinc-500"}`}
              >
                <span
                  className={`size-1 rounded-full ${proxyManager?.available ? proxyManager.healthyCount === proxyManager.hostCount ? "bg-emerald-400" : "bg-amber-300" : "bg-zinc-700"}`}
                />
                {proxyManager?.available
                  ? `${proxyManager.healthyCount}/${proxyManager.hostCount}`
                  : "—"}
              </span>
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12px] text-zinc-500 transition hover:bg-white/[0.035] hover:text-zinc-300"
            >
              <GitFork className="size-3.5" />
              GitHub
              <span
                className={`ml-auto flex max-w-24 items-center gap-1 truncate text-[11px] ${githubIntegration?.authenticated ? "text-emerald-400/80" : "text-zinc-500"}`}
              >
                <span
                  className={`size-1 shrink-0 rounded-full ${githubIntegration?.authenticated ? "bg-emerald-400" : "bg-zinc-700"}`}
                />
                <span className="truncate">
                  {githubIntegration?.authenticated
                    ? githubIntegration.accounts.length > 1
                      ? `${githubIntegration.accounts.length} accounts`
                      : (githubIntegration.account ?? "Connected")
                    : "Not connected"}
                </span>
              </span>
            </a>
          </div>
        </div>

        <div className="mt-auto">
          <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-300">
              <Zap className="size-3.5 text-violet-300" />
              Local agent
              <span
                className={`ml-auto size-1.5 rounded-full ${agentState === "online" ? "bg-emerald-400 shadow-[0_0_7px_#34d399]" : "bg-zinc-600"}`}
              />
            </div>
            <p className="mt-1.5 text-[12px] leading-4 text-zinc-600">
              {agentState === "online"
                ? dockerAvailable
                  ? "Live Git and Docker controls are ready."
                  : "Git is ready; Docker is unavailable."
                : "Start the agent to enable local controls."}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12px] text-zinc-500 transition hover:bg-white/[0.035] hover:text-zinc-300"
          >
            <Settings className="size-3.5" />
            Settings
            <span className="ml-auto font-mono text-[11px] text-zinc-500">⌘,</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="relative lg:pl-[236px]">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-white/[0.055] bg-[#090a0d]/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="mr-3 rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 lg:hidden"
          >
            <Menu className="size-4" />
          </button>

          <div className="relative w-full max-w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search projects, stacks, branches..."
              aria-label="Search projects"
              className="h-9 w-full rounded-lg border border-white/[0.07] bg-white/[0.035] pl-9 pr-12 text-[12px] text-zinc-200 outline-none transition placeholder:text-zinc-500 hover:border-white/[0.11] focus:border-violet-400/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-500/10"
            />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-white/[0.07] bg-black/20 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 transition hover:text-zinc-300 sm:flex"
            >
              <Command className="size-2.5" />K
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-[12px] text-zinc-500 sm:flex">
              <CircleDot
                className={`size-3 ${agentState === "online" ? "text-emerald-400" : "text-zinc-600"}`}
              />
              {agentState === "online" ? `${runningCount} running` : "Agent offline"}
            </div>
            <button
              type="button"
              onClick={() => setAddProjectOpen(true)}
              disabled={agentState !== "online"}
              title={agentState === "online" ? "Add a local project" : "Local agent must be online"}
              className="flex h-9 items-center gap-2 rounded-lg bg-zinc-100 px-3 text-[11px] font-semibold text-zinc-950 transition hover:bg-white active:scale-[0.98]"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">Add project</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1540px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          {selectedProject ? (
            <ProjectDetailPage
              project={selectedProject}
              runtime={runtimeByProject[selectedProject.id]}
              activity={selectedProjectActivity}
              favorite={favoriteIdSet.has(selectedProject.id)}
              agentOnline={agentState === "online"}
              busy={pendingProject === selectedProject.id}
              onClose={closeProjectDetails}
              onAction={handleAction}
              onProjectUsed={markProjectUsed}
              onToggleFavorite={toggleFavorite}
              onEdit={() => setEditingProjectId(selectedProject.id)}
              onRemove={() => void handleProjectRemoved(selectedProject.id)}
            />
          ) : (
            <>
          <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-violet-400/80">
                Developer command center
              </p>
              <h1 className="text-2xl font-semibold tracking-[-0.035em] text-zinc-50 sm:text-[28px]">
                Your projects, ready to launch.
              </h1>
              <p className="mt-2 max-w-xl text-[12px] leading-5 text-zinc-500">
                Jump back into active work, inspect services, and open every environment from one place.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshStatus()}
                className="flex w-fit items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
              >
                {lastChecked
                  ? `Updated ${new Date(lastChecked).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Status unavailable"}
              </button>
              <label className="relative flex items-center">
                <span className="sr-only">Sort projects</span>
                <ArrowUpDown className="pointer-events-none absolute left-3 size-3 text-zinc-600" />
                <select
                  value={sortMode}
                  onChange={(event) => {
                    const nextSort = event.target.value as SortMode;
                    setSortMode(nextSort);
                    window.localStorage.setItem(sortStorageKey, nextSort);
                  }}
                  className="h-[34px] appearance-none rounded-lg border border-white/[0.07] bg-white/[0.025] pl-8 pr-8 text-[11px] text-zinc-500 outline-none transition hover:bg-white/[0.05] hover:text-zinc-300 focus:border-violet-400/40"
                >
                  <option value="status">Running first</option>
                  <option value="recent">Recently used</option>
                  <option value="name">Project name</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 size-3 text-zinc-500" />
              </label>
            </div>
          </div>

          {filteredProjects.length > 0 ? (
            <div className="space-y-10">
              {category === "all" && favoriteProjects.length > 0 && (
                <ProjectSection
                  title="Favorites"
                  subtitle="Pinned for fast access"
                  projects={favoriteProjects}
                  runtimeByProject={runtimeByProject}
                  agentOnline={agentState === "online"}
                  pendingProject={pendingProject}
                  favoriteIds={favoriteIdSet}
                  onAction={handleAction}
                  onProjectUsed={markProjectUsed}
                  onToggleFavorite={toggleFavorite}
                  onOpenDetails={openProjectDetails}
                />
              )}
              {(category === "all" || category === "work") && (
                <ProjectSection
                  title="Work"
                  subtitle="Client and team workspaces"
                  projects={workProjects}
                  runtimeByProject={runtimeByProject}
                  agentOnline={agentState === "online"}
                  pendingProject={pendingProject}
                  favoriteIds={favoriteIdSet}
                  onAction={handleAction}
                  onProjectUsed={markProjectUsed}
                  onToggleFavorite={toggleFavorite}
                  onOpenDetails={openProjectDetails}
                />
              )}
              {(category === "all" || category === "personal") && (
                <ProjectSection
                  title="Personal"
                  subtitle="Experiments and independent projects"
                  projects={personalProjects}
                  runtimeByProject={runtimeByProject}
                  agentOnline={agentState === "online"}
                  pendingProject={pendingProject}
                  favoriteIds={favoriteIdSet}
                  onAction={handleAction}
                  onProjectUsed={markProjectUsed}
                  onToggleFavorite={toggleFavorite}
                  onOpenDetails={openProjectDetails}
                />
              )}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] text-center">
              <div>
                <Search className="mx-auto size-5 text-zinc-500" />
                <p className="mt-3 text-[13px] font-medium text-zinc-400">No matching projects</p>
                <p className="mt-1 text-[11px] text-zinc-600">
                  Try a different project name, stack, or branch.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-4 text-[11px] font-medium text-violet-300 hover:text-violet-200"
                >
                  Clear search
                </button>
              </div>
            </div>
          )}

          <section className="mt-11 border-t border-white/[0.055] pt-8">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[14px] font-semibold text-zinc-200">Quick Tools</h2>
                  <Keyboard className="size-3.5 text-zinc-500" />
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">Common actions, one shortcut away</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    type="button"
                    key={tool.name}
                    className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-white/[0.065] bg-[#101115] p-3.5 text-left transition hover:border-white/[0.13] hover:bg-[#131419]"
                  >
                    <span
                      className={`absolute -left-4 top-1/2 size-12 -translate-y-1/2 rounded-full opacity-0 blur-2xl transition group-hover:opacity-10 ${tool.glow}`}
                    />
                    <span
                      className={`relative grid size-9 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.035] ${tool.color}`}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="relative min-w-0">
                      <span className="block text-[12px] font-medium text-zinc-300">{tool.name}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-zinc-600">{tool.detail}</span>
                    </span>
                    <span className="ml-auto rounded border border-white/[0.06] bg-black/20 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500">
                      ⌘{tool.shortcut}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
            </>
          )}
        </main>
      </div>

      {addProjectOpen && (
        <ProjectFormDialog onClose={closeAddProject} onSaved={handleProjectAdded} />
      )}

      {editingProject && (
        <ProjectFormDialog
          project={editingProject}
          autoLocalUrl={editingAutoLocalUrl}
          onClose={() => setEditingProjectId(null)}
          onSaved={handleProjectUpdated}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          projects={sortedProjects}
          runtimeByProject={runtimeByProject}
          favoriteIds={favoriteIdSet}
          agentOnline={agentState === "online"}
          pendingProject={pendingProject}
          onClose={() => setPaletteOpen(false)}
          onAction={handleAction}
          onProjectUsed={markProjectUsed}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {notification && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-white/[0.09] bg-[#15161b]/95 px-4 py-3 text-[12px] text-zinc-300 shadow-[0_18px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          <span
            className={`size-2 shrink-0 rounded-full ${notification.kind === "success" ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-rose-400"}`}
          />
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            aria-label="Dismiss notification"
            className="ml-2 rounded p-1 text-zinc-600 hover:bg-white/5 hover:text-zinc-300"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
