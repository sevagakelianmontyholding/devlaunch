"use client";

import { FolderOpen, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { pickProjectFolder, saveProject } from "@/actions";
import type { ComposeAction, Project, Section } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Dialog, ErrorNote, Field, Input, Segmented } from "./ui";

function nameFromPath(folder: string) {
  const last = folder.replace(/\/$/, "").split("/").at(-1) ?? "";
  return last.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ProjectDialog({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved?: (project: Project) => void }) {
  const { refresh, notify } = useStatus();
  const [path, setPath] = useState(project?.path ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [section, setSection] = useState<Section>(project?.section ?? "work");
  const [description, setDescription] = useState(project?.description ?? "");
  const [stack, setStack] = useState(project?.stack.join(", ") ?? "");
  const [localUrl, setLocalUrl] = useState(project?.localUrl ?? "");
  const [testingUrl, setTestingUrl] = useState(project?.testingUrl ?? "");
  const [liveUrl, setLiveUrl] = useState(project?.liveUrl ?? "");
  const [composeFile, setComposeFile] = useState(project?.composeFile ?? "");
  const [commands, setCommands] = useState<Record<ComposeAction, string>>({
    start: project?.commands.start ?? "",
    stop: project?.commands.stop ?? "",
    restart: project?.commands.restart ?? "",
    rebuild: project?.commands.rebuild ?? "",
  });
  const [browsing, setBrowsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = async () => {
    setBrowsing(true);
    const result = await pickProjectFolder();
    setBrowsing(false);
    if (!result.ok) return setError(result.error);
    setPath(result.data);
    setName((current) => current || nameFromPath(result.data));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveProject(project?.id ?? null, {
      path,
      name,
      section,
      description,
      stack: stack.split(",").map((item) => item.trim()).filter(Boolean),
      localUrl,
      testingUrl,
      liveUrl,
      composeFile,
      commands,
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    notify("success", `${result.data.name} ${project ? "updated" : "added"}`);
    await refresh();
    onSaved?.(result.data);
    onClose();
  };

  return (
    <Dialog title={project ? `Edit ${project.name}` : "Add a project"} description="Any folder on this Mac. Nothing is scanned automatically." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Project folder">
          <div className="flex gap-2">
            <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/Users/you/projects/my-app" className="font-mono text-[12px]" autoFocus />
            <Button type="button" onClick={browse} busy={browsing} icon={<FolderOpen className="size-4" />}>
              Browse
            </Button>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="My App" />
          </Field>
          <Field label="Section">
            <div className="pt-0.5">
              <Segmented value={section} onChange={setSection} options={[{ value: "work", label: "Work" }, { value: "personal", label: "Personal" }]} />
            </div>
          </Field>
        </div>

        <Field label="Description" hint="optional">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this project is" maxLength={300} />
        </Field>

        <Field label="Stack" hint="comma separated">
          <Input value={stack} onChange={(event) => setStack(event.target.value)} placeholder="Next.js, Postgres, Docker" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Local URL" hint="optional">
            <Input value={localUrl} onChange={(event) => setLocalUrl(event.target.value)} placeholder="http://my-app.localhost" inputMode="url" className="font-mono text-[12px]" />
          </Field>
          <Field label="Testing URL" hint="optional">
            <Input value={testingUrl} onChange={(event) => setTestingUrl(event.target.value)} placeholder="https://test.my-app.com" inputMode="url" className="font-mono text-[12px]" />
          </Field>
          <Field label="Live URL" hint="optional">
            <Input value={liveUrl} onChange={(event) => setLiveUrl(event.target.value)} placeholder="https://my-app.com" inputMode="url" className="font-mono text-[12px]" />
          </Field>
        </div>

        <div className="rounded-lg border border-line bg-bg p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-medium">
            <TerminalSquare className="size-3.5 text-accent" /> Local commands
          </p>
          <p className="mt-1 text-[11px] leading-4 text-ink-dim">
            Nothing is detected automatically. Set a compose file to get the default docker compose commands, and/or write your own — each runs in the project folder with your login shell.
          </p>
          <Field label="Compose file" hint="relative to the project, optional" className="mt-3">
            <Input value={composeFile} onChange={(event) => setComposeFile(event.target.value)} placeholder="docker-compose.yml" className="font-mono text-[12px]" />
          </Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["start", "up -d"],
                ["stop", "stop"],
                ["restart", "restart"],
                ["rebuild", "up -d --build"],
              ] as Array<[ComposeAction, string]>
            ).map(([action, suffix]) => (
              <Field key={action} label={`${action[0]!.toUpperCase()}${action.slice(1)} command`} hint="optional">
                <Input
                  value={commands[action]}
                  onChange={(event) => setCommands((current) => ({ ...current, [action]: event.target.value }))}
                  placeholder={composeFile.trim() ? `docker compose -f ${composeFile.trim()} ${suffix}` : "not configured"}
                  className="font-mono text-[12px]"
                />
              </Field>
            ))}
          </div>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={saving} disabled={!path.trim() || !name.trim()}>
            {project ? "Save changes" : "Add project"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
