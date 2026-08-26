import type { ProjectAction } from "./agent";

export type ActivityEntry = {
  id: string;
  projectId: string;
  action: ProjectAction;
  message: string;
  kind: "success" | "error";
  createdAt: number;
};
