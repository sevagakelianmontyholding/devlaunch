"use client";

import { ArrowDownToLine, ArrowUpFromLine, GitBranch, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { runGit } from "@/actions";
import { actionDone, actionRunning } from "@/lib/labels";
import type { GitAction, LocalRun, Project, RepoStatus } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Dialog, Dot, ErrorNote, Field, IconButton, Select, Textarea, cx, timeAgo } from "./ui";

export function ReposCard({ project, repos }: { project: Project; repos: RepoStatus[] }) {
  const { status, refresh, notify } = useStatus();
  const [run, setRun] = useState<LocalRun | null>(null);
  const [committing, setCommitting] = useState<string | null | false>(false);
  const [busy, setBusy] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);
  const notifiedRef = useRef<string | null>(null);
  const otherRunning = Boolean(status.activeActions[project.id]) && status.activeActions[project.id]?.runId !== run?.id;

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const interval = setInterval(async () => {
      const response = await fetch(`/api/local-runs/${run.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const { run: next } = (await response.json()) as { run: LocalRun };
      setRun(next);
    }, 1000);
    return () => clearInterval(interval);
  }, [run]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [run?.log]);

  useEffect(() => {
    if (!run || run.status === "running" || notifiedRef.current === run.id) return;
    notifiedRef.current = run.id;
    notify(run.status === "success" ? "success" : "error", run.status === "success" ? `${actionDone[run.action]} — ${project.name}` : `${run.action} failed — see the output`);
    void refresh();
  }, [run, notify, refresh, project.name]);

  const start = async (repoPath: string | null, action: GitAction, message?: string): Promise<string | null> => {
    setBusy(`${repoPath ?? "*"}:${action}`);
    const result = await runGit(project.id, repoPath, action, message);
    setBusy(null);
    if (!result.ok) {
      if (action !== "commit") notify("error", result.error);
      return result.error;
    }
    setRun(result.data);
    setCommitting(false);
    return null;
  };

  const running = run?.status === "running" || otherRunning;
  const changed = repos.reduce((total, repo) => total + repo.changed, 0);
  const ahead = repos.reduce((total, repo) => total + repo.ahead, 0);

  return (
    <Card>
      <CardTitle
        icon={<GitBranch className="size-4" />}
        aside={
          repos.length > 0 ? (
            <>
              <IconButton label="Fetch all" onClick={() => void start(null, "fetch")} disabled={running} className={cx(busy === "*:fetch" && "animate-spin")}>
                <RefreshCw className="size-3.5" />
              </IconButton>
              <Button size="sm" icon={<ArrowDownToLine className="size-3.5" />} onClick={() => void start(null, "pull")} disabled={running || repos.some((repo) => repo.changed > 0)} busy={busy === "*:pull"} title={repos.some((repo) => repo.changed > 0) ? "Commit or stash the changed repositories first" : "Fetches and fast-forwards every repository"}>
                Pull all
              </Button>
              <Button size="sm" icon={<ArrowUpFromLine className="size-3.5" />} onClick={() => void start(null, "push")} disabled={running || ahead === 0} busy={busy === "*:push"} title="git push in every repository">
                Push all
              </Button>
              <Button size="sm" variant="primary" icon={<GitCommitHorizontal className="size-3.5" />} onClick={() => setCommitting(null)} disabled={running || (changed === 0 && ahead === 0)}>
                Commit &amp; push
              </Button>
            </>
          ) : null
        }
      >
        Repositories
      </CardTitle>

      {repos.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No git repositories found in the project folder or its subfolders.</p>
      ) : (
        <div className="divide-y divide-line">
          {repos.map((repo) => (
            <div key={repo.path} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <Dot tone={repo.error ? "danger" : repo.changed > 0 ? "warn" : repo.behind > 0 || repo.ahead > 0 ? "accent" : "success"} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-[12px]">
                  <span className="font-medium">{repo.path === "." ? "Project root" : repo.name}</span>
                  {repo.error ? (
                    <span className="text-danger">{repo.error}</span>
                  ) : (
                    <>
                      <span className="font-mono text-ink-dim">{repo.branch}</span>
                      {repo.changed > 0 && <span className="text-warn">{repo.changed} changed</span>}
                      {repo.behind > 0 && <span className="text-accent">↓{repo.behind} behind</span>}
                      {repo.ahead > 0 && <span className="text-accent">↑{repo.ahead} ahead</span>}
                      {!repo.upstream && <span className="text-ink-faint">no upstream</span>}
                      {repo.changed === 0 && repo.behind === 0 && repo.ahead === 0 && repo.upstream && <span className="text-ink-faint">up to date</span>}
                    </>
                  )}
                </p>
                {repo.lastCommit && (
                  <p className="truncate text-[11px] text-ink-faint" title={`${repo.lastCommit.hash} ${repo.lastCommit.subject}`}>
                    <span className="font-mono">{repo.lastCommit.hash}</span> {repo.lastCommit.subject} · {timeAgo(repo.lastCommit.date)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <IconButton label="Fetch" onClick={() => void start(repo.path, "fetch")} disabled={running || Boolean(repo.error)}>
                  <RefreshCw className={cx("size-3.5", busy === `${repo.path}:fetch` && "animate-spin")} />
                </IconButton>
                <IconButton label={repo.changed > 0 ? "Pull (commit or stash your changes first)" : "Pull (fetches first, fast-forward only)"} onClick={() => void start(repo.path, "pull")} disabled={running || Boolean(repo.error) || repo.changed > 0}>
                  <ArrowDownToLine className="size-3.5" />
                </IconButton>
                <IconButton label="Push" onClick={() => void start(repo.path, "push")} disabled={running || Boolean(repo.error) || (repo.ahead === 0 && repo.upstream)}>
                  <ArrowUpFromLine className="size-3.5" />
                </IconButton>
                <IconButton label="Commit and push" onClick={() => setCommitting(repo.path)} disabled={running || Boolean(repo.error) || (repo.changed === 0 && repo.ahead === 0)} className="text-accent">
                  <GitCommitHorizontal className="size-3.5" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {run && (
        <div className={cx("mt-3 rounded-lg border p-3", run.status === "running" ? "border-warn/25 bg-warn/[0.05]" : run.status === "success" ? "border-success/20 bg-success/[0.04]" : "border-danger/20 bg-danger/[0.05]")}>
          <div className="flex items-center gap-2 text-[12px]">
            <Dot tone={run.status === "running" ? "warn" : run.status === "success" ? "success" : "danger"} pulse={run.status === "running"} />
            <span className="font-medium">{run.status === "running" ? `${actionRunning[run.action]}…` : run.status === "success" ? actionDone[run.action] : `${run.action} failed`}</span>
            {run.status !== "running" && (
              <button type="button" onClick={() => setRun(null)} className="ml-auto text-[11px] text-ink-dim hover:text-ink">
                Dismiss
              </button>
            )}
          </div>
          <pre ref={logRef} className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-black/40 p-3 font-mono text-[11px] leading-4 text-ink-dim">
            {run.log}
          </pre>
        </div>
      )}

      {committing !== false && <CommitDialog repos={repos} initial={committing} onClose={() => setCommitting(false)} onSubmit={(repoPath, message) => start(repoPath, "commit", message)} />}
    </Card>
  );
}

function CommitDialog({ repos, initial, onClose, onSubmit }: { repos: RepoStatus[]; initial: string | null; onClose: () => void; onSubmit: (repoPath: string | null, message: string) => Promise<string | null> }) {
  const [repoPath, setRepoPath] = useState<string>(initial ?? "*");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = repoPath === "*" ? repos.filter((repo) => repo.changed > 0 || repo.ahead > 0) : repos.filter((repo) => repo.path === repoPath);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const problem = await onSubmit(repoPath === "*" ? null : repoPath, message);
    setSaving(false);
    if (problem) setError(problem);
  };

  return (
    <Dialog title="Commit and push" description="Stages everything in the repository, commits with your message, and pushes to its upstream." onClose={onClose} width="max-w-[520px]">
      <form onSubmit={submit} className="space-y-4">
        {repos.length > 1 && (
          <Field label="Repository">
            <Select value={repoPath} onChange={(event) => setRepoPath(event.target.value)}>
              <option value="*">All repositories with changes</option>
              {repos.map((repo) => (
                <option key={repo.path} value={repo.path}>
                  {repo.path === "." ? "Project root" : repo.name} — {repo.changed} changed{repo.ahead ? `, ${repo.ahead} to push` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Commit message">
          <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} autoFocus placeholder="What changed" maxLength={500} />
        </Field>
        <p className="text-[11px] text-ink-faint">
          {targets.length === 0
            ? "Nothing to commit or push."
            : targets.map((repo) => `${repo.path === "." ? "root" : repo.name}: ${repo.changed > 0 ? `commit ${repo.changed} change${repo.changed === 1 ? "" : "s"} and push` : "push only"}`).join(" · ")}
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={saving} disabled={!message.trim() || targets.length === 0} icon={<GitCommitHorizontal className="size-3.5" />}>
            Commit &amp; push
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
