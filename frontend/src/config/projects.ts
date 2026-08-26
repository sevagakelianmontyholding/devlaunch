export type ProjectCategory = "work" | "personal";
export type ProjectStatus = "running" | "idle" | "offline";

export type ProjectLinks = {
  code?: string;
  github?: string;
  local?: string;
  live?: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  accent: string;
  monogram: string;
  stack: string[];
  status: ProjectStatus;
  branch: string;
  updatedAt: string;
  localPath: string;
  repositoryPaths: string[] | null;
  links: ProjectLinks;
};

type RegistryProject = {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  stack: string[];
  localPath: string;
  repositoryPaths: string[] | null;
  github: string | null;
  local: string | null;
  live: string | null;
};

const accents = ["#7C6CFF", "#3DD9B5", "#FF8A65", "#F3C969", "#58A6FF", "#D879F1"];

function monogram(name: string) {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  return (words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : name.slice(0, 2)).toUpperCase();
}

function accentForId(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return accents[hash % accents.length] ?? accents[0]!;
}

export function projectFromRegistry(project: RegistryProject): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    category: project.category,
    accent: accentForId(project.id),
    monogram: monogram(project.name),
    stack: project.stack,
    status: "idle",
    branch: "local",
    updatedAt: "Available locally",
    localPath: project.localPath,
    repositoryPaths: project.repositoryPaths,
    links: {
      code: `vscode://file${project.localPath}`,
      github: project.github ?? undefined,
      local: project.local ?? undefined,
      live: project.live ?? undefined,
    },
  };
}

// The local agent registry is the source of truth. No personal project data is bundled.
export const projects: Project[] = [];
