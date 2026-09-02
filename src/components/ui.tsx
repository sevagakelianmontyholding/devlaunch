"use client";

import { LoaderCircle, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  busy?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", busy, icon, className, children, disabled, ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const sizes = size === "sm" ? "h-8 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]";
  const variants = {
    primary: "bg-accent text-accent-ink hover:bg-teal-300",
    secondary: "border border-line bg-panel-2 text-ink hover:border-line-strong hover:bg-[#1e1e23]",
    ghost: "text-ink-dim hover:bg-white/[0.05] hover:text-ink",
    danger: "bg-danger/90 text-[#2a0a12] hover:bg-danger",
  }[variant];
  return (
    <button className={cx(base, sizes, variants, className)} disabled={disabled || busy} {...props}>
      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// Small styled tooltip shown on hover and keyboard focus of the wrapped element.
export function Tip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-panel-2 px-2 py-1 text-[11px] text-ink opacity-0 shadow-lg transition-opacity delay-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function IconButton({ label, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        className={cx("grid size-8 place-items-center rounded-lg text-ink-dim transition hover:bg-white/[0.06] hover:text-ink disabled:opacity-40", className)}
        {...props}
      >
        {children}
      </button>
    </Tip>
  );
}

export function IconLink({ label, href, children }: { label: string; href: string; children: ReactNode }) {
  return (
    <Tip label={label}>
      <a href={href} target="_blank" rel="noreferrer" aria-label={label} className="grid size-8 place-items-center rounded-lg text-ink-dim transition hover:bg-white/[0.06] hover:text-ink">
        {children}
      </a>
    </Tip>
  );
}

const fieldClass =
  "w-full rounded-lg border border-line bg-bg px-3 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/60";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldClass, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldClass, "py-2.5 leading-5", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldClass, "h-10 appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-ink-dim">
        {label}
        {hint && <span className="ml-1.5 font-normal text-ink-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-bg p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            "rounded-md px-3 py-1.5 text-[12px] font-medium transition",
            option.value === value ? "bg-panel-2 text-ink shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]" : "text-ink-dim hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Dot({ tone, pulse }: { tone: "success" | "warn" | "danger" | "muted" | "accent"; pulse?: boolean }) {
  const color = { success: "bg-success", warn: "bg-warn", danger: "bg-danger", muted: "bg-ink-faint", accent: "bg-accent" }[tone];
  return <span className={cx("inline-block size-1.5 shrink-0 rounded-full", color, pulse && "animate-pulse")} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-card border border-line bg-panel p-4", className)}>{children}</section>;
}

export function CardTitle({ icon, children, aside }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && <span className="text-accent">{icon}</span>}
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-dim">{children}</h2>
      {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
    </div>
  );
}

export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-line px-4 py-10 text-center">
      <div>
        {icon && <div className="mx-auto mb-3 grid size-9 place-items-center rounded-lg bg-panel-2 text-ink-dim">{icon}</div>}
        <p className="text-[13px] font-medium text-ink">{title}</p>
        {hint && <p className="mt-1 text-[12px] text-ink-faint">{hint}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-danger/20 bg-danger/[0.08] px-3 py-2 text-[12px] leading-5 text-danger">
      {children}
    </p>
  );
}

export function Dialog({ title, description, onClose, children, width = "max-w-[800px]" }: { title: string; description?: string; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx("fade-up relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-card border border-line-strong bg-panel shadow-2xl", width)}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-[12px] text-ink-dim">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ title, body, confirmLabel, tone = "danger", busy, onCancel, onConfirm }: { title: string; body: ReactNode; confirmLabel: string; tone?: "danger" | "primary"; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fade-up rounded-lg border border-line bg-panel-2 p-3">
      <p className="text-[13px] font-medium">{title}</p>
      <div className="mt-1 text-[12px] leading-5 text-ink-dim">{body}</div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" variant={tone} onClick={onConfirm} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-ink-dim">
      <LoaderCircle className="size-3.5 animate-spin" /> {label}
    </span>
  );
}

export function Monogram({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const text = (words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : name.slice(0, 2)).toUpperCase();
  const dims = { sm: "size-7 text-[10px]", md: "size-10 text-[12px]", lg: "size-12 text-[14px]" }[size];
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent/10 font-semibold tracking-wider text-accent", dims)}>
      {text}
    </span>
  );
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
