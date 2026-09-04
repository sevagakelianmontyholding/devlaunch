"use client";

import { LayoutTemplate, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getTemplates, removeTemplate, saveTemplate } from "@/actions";
import type { ProjectTemplate } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, Dialog, ErrorNote, Field, IconButton, Input, Spinner, timeAgo } from "./ui";

export function TemplatesCard() {
  const { notify } = useStatus();
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => setTemplates(await getTemplates()), []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const remove = async (id: string) => {
    const result = await removeTemplate(id);
    if (!result.ok) return notify("error", result.error);
    setConfirmDelete(null);
    notify("success", `${result.data.name} removed`);
    void load();
  };

  return (
    <Card>
      <CardTitle icon={<LayoutTemplate className="size-4" />}>Project templates</CardTitle>
      <p className="mb-3 text-[12px] text-ink-dim">
        Save a project&apos;s local commands and deployments from its page, then pick the template when adding the next project. <span className="font-mono">{"{slug}"}</span>,{" "}
        <span className="font-mono">{"{folder}"}</span> and <span className="font-mono">{"{name}"}</span> are filled in from the new project.
      </p>
      {templates === null ? (
        <Spinner label="Loading…" />
      ) : templates.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No templates yet. Open a project and use “Save as template”.</p>
      ) : (
        <div className="divide-y divide-line">
          {templates.map((template) => (
            <div key={template.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{template.name}</p>
                  <p className="truncate text-[11px] text-ink-faint">
                    From {template.sourceProject || "a project"} · {template.project.composeFile ? `compose ${template.project.composeFile}` : "custom commands"} ·{" "}
                    {template.deployments.length === 0 ? "no deployments" : template.deployments.map((item) => `${item.name} → ${item.serverName}`).join(", ")} · saved {timeAgo(template.createdAt)}
                  </p>
                </div>
                <IconButton label="Remove template" onClick={() => setConfirmDelete(template.id)} className="hover:text-danger">
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
              {confirmDelete === template.id && (
                <div className="mt-2">
                  <Confirm title="Remove this template?" body="Projects created from it are not affected." confirmLabel="Remove" onCancel={() => setConfirmDelete(null)} onConfirm={() => void remove(template.id)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function SaveTemplateDialog({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose: () => void }) {
  const { notify } = useStatus();
  const [name, setName] = useState(projectName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveTemplate(projectId, name);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    notify("success", `Template “${result.data.name}” saved with ${result.data.deployments.length} deployment${result.data.deployments.length === 1 ? "" : "s"}`);
    onClose();
  };

  return (
    <Dialog title="Save as template" description="Keeps this project's section, commands, URLs and deployments (without env file contents) for the next project." onClose={onClose} width="max-w-[480px]">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Template name">
          <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={60} />
        </Field>
        <p className="text-[11px] text-ink-faint">
          Where the project&apos;s id or folder name appears (image names, server paths, URLs), it is replaced by <span className="font-mono">{"{slug}"}</span> or <span className="font-mono">{"{folder}"}</span> so the next project gets its own values.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={saving} disabled={!name.trim()}>
            Save template
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
