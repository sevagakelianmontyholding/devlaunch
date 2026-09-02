"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, setupAccount } from "@/actions";
import { Button, ErrorNote, Field, Input } from "./ui";

export function LoginScreen({ firstRun }: { firstRun: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (firstRun && password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    setError(null);
    const result = firstRun ? await setupAccount(username, password) : await login(username, password);
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    router.refresh();
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="fade-up w-full max-w-[380px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[#0f2f2b]">
            <svg viewBox="0 0 64 64" className="size-6" aria-hidden="true">
              <path d="M20 44 L32 16 L44 44" fill="none" stroke="#2dd4bf" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M25 36 H39" stroke="#2dd4bf" strokeWidth="6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[18px] font-semibold tracking-tight">DevLaunch</span>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-card border border-line bg-panel p-5">
          <div>
            <h1 className="text-[15px] font-semibold">{firstRun ? "Create your account" : "Sign in"}</h1>
            <p className="mt-1 text-[12px] text-ink-dim">
              {firstRun ? "This is the first run. The account lives only in this Mac's local database." : "Welcome back."}
            </p>
          </div>
          <Field label="Username">
            <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus autoCapitalize="none" />
          </Field>
          <Field label="Password" hint={firstRun ? "at least 8 characters" : undefined}>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={firstRun ? "new-password" : "current-password"} />
          </Field>
          {firstRun && (
            <Field label="Confirm password">
              <Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
            </Field>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" variant="primary" className="w-full" busy={busy} disabled={!username.trim() || !password}>
            {firstRun ? "Create account" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
