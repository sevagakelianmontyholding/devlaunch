import type { LocalAction } from "./types";

export const actionRunning: Record<LocalAction, string> = {
  start: "Starting",
  stop: "Stopping",
  restart: "Restarting",
  rebuild: "Rebuilding",
  fetch: "Fetching",
  pull: "Pulling",
  push: "Pushing",
  commit: "Committing and pushing",
  custom: "Running",
};

export const actionDone: Record<LocalAction, string> = {
  start: "Started",
  stop: "Stopped",
  restart: "Restarted",
  rebuild: "Rebuilt",
  fetch: "Fetched",
  pull: "Pulled",
  push: "Pushed",
  commit: "Committed and pushed",
  custom: "Finished",
};
