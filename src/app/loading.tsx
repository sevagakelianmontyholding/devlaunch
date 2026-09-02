import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex items-center gap-2 text-[13px] text-ink-dim">
        <LoaderCircle className="size-4 animate-spin text-accent" /> Loading…
      </div>
    </div>
  );
}
