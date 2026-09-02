"use client";

import { NotebookPen, Pencil } from "lucide-react";
import { useState } from "react";
import { saveProjectNotes } from "@/actions";
import type { Project } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, IconButton, Textarea } from "./ui";

// Minimal rendering: paragraphs, line breaks, `code`, **bold**, and bare URLs as links.
function render(text: string) {
  return text.split(/\n{2,}/).map((paragraph, index) => (
    <p key={index} className="whitespace-pre-wrap break-words text-[12px] leading-5 text-ink">
      {paragraph.split(/(https?:\/\/\S+|`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
        if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer" className="text-accent hover:underline">{part}</a>;
        if (part.startsWith("`")) return <code key={i} className="rounded bg-bg px-1 font-mono text-[11px] text-accent">{part.slice(1, -1)}</code>;
        if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        return part;
      })}
    </p>
  ));
}

export function NotesCard({ project }: { project: Project }) {
  const { refresh, notify } = useStatus();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.notes);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const result = await saveProjectNotes(project.id, draft);
    setSaving(false);
    if (!result.ok) return notify("error", result.error);
    setEditing(false);
    await refresh();
  };

  return (
    <Card>
      <CardTitle
        icon={<NotebookPen className="size-4" />}
        aside={
          !editing && (
            <IconButton label="Edit notes" onClick={() => { setDraft(project.notes); setEditing(true); }} className="size-7">
              <Pencil className="size-3.5" />
            </IconButton>
          )
        }
      >
        Notes
      </CardTitle>
      {editing ? (
        <div>
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} placeholder={"Ports, admin logins, gotchas…\n\nSupports **bold**, `code`, and links."} className="text-[12px]" autoFocus />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={() => void save()} busy={saving}>
              Save
            </Button>
          </div>
        </div>
      ) : project.notes.trim() ? (
        <div className="space-y-2">{render(project.notes)}</div>
      ) : (
        <p className="text-[12px] text-ink-faint">No notes yet — keep the things you always forget here: ports, admin logins, gotchas.</p>
      )}
    </Card>
  );
}
