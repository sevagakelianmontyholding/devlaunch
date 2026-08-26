import type { Project } from "@/config/projects";
import type { AgentProjectStatus, ProjectAction } from "@/types/agent";
import { ProjectCard } from "./project-card";

export function ProjectSection({
  title,
  subtitle,
  projects,
  runtimeByProject,
  agentOnline,
  pendingProject,
  favoriteIds,
  onAction,
  onProjectUsed,
  onToggleFavorite,
  onOpenDetails,
}: {
  title: string;
  subtitle: string;
  projects: Project[];
  runtimeByProject: Record<string, AgentProjectStatus>;
  agentOnline: boolean;
  pendingProject: string | null;
  favoriteIds: Set<string>;
  onAction: (id: string, action: ProjectAction) => void;
  onProjectUsed: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenDetails: (id: string) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[14px] font-semibold text-zinc-200">{title}</h2>
            <span className="rounded-md bg-white/[0.045] px-1.5 py-0.5 text-[12px] font-medium text-zinc-500">
              {projects.length}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">{subtitle}</p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            runtime={runtimeByProject[project.id]}
            agentOnline={agentOnline}
            busy={pendingProject === project.id}
            favorite={favoriteIds.has(project.id)}
            onAction={onAction}
            onProjectUsed={onProjectUsed}
            onToggleFavorite={onToggleFavorite}
            onOpenDetails={onOpenDetails}
          />
        ))}
      </div>
    </section>
  );
}
