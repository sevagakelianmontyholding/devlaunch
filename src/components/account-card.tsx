"use client";

import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { updateDeployPin, updatePassword } from "@/actions";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Dialog, ErrorNote, Field, Input } from "./ui";

export function AccountCard() {
  const { status, refresh, notify } = useStatus();
  const [dialog, setDialog] = useState<"password" | "pin" | "clear-pin" | null>(null);
  const user = status.user;

  return (
    <Card>
      <CardTitle icon={<UserRound className="size-4" />}>Account</CardTitle>
      <dl className="space-y-2 text-[12px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-dim">Signed in as</dt>
          <dd className="font-medium">{user.username}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-dim">Password</dt>
          <dd>
            <button type="button" onClick={() => setDialog("password")} className="text-accent hover:underline">
              Change
            </button>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-dim">Deploy passphrase</dt>
          <dd className="flex items-center gap-2">
            <span className={user.hasPin ? "text-success" : "text-ink-faint"}>{user.hasPin ? "On" : "Off"}</span>
            <button type="button" onClick={() => setDialog("pin")} className="text-accent hover:underline">
              {user.hasPin ? "Change" : "Set up"}
            </button>
            {user.hasPin && (
              <button type="button" onClick={() => setDialog("clear-pin")} className="text-ink-dim hover:text-danger hover:underline">
                Remove
              </button>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-ink-faint">
        <ShieldCheck className="mt-0.5 size-3 shrink-0" />
        With a passphrase on, every Deploy click asks for the 4 digits before anything runs.
      </p>

      {dialog === "password" && (
        <PasswordDialog
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            notify("success", "Password changed");
          }}
        />
      )}
      {(dialog === "pin" || dialog === "clear-pin") && (
        <PinDialog
          clearing={dialog === "clear-pin"}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            notify("success", dialog === "clear-pin" ? "Deploy passphrase removed" : "Deploy passphrase saved");
            await refresh();
          }}
        />
      )}
    </Card>
  );
}

function PasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirm) return setError("New passwords do not match");
    setBusy(true);
    const result = await updatePassword(current, next);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDone();
  };

  return (
    <Dialog title="Change password" onClose={onClose} width="max-w-[420px]">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password">
          <Input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" autoFocus />
        </Field>
        <Field label="New password" hint="at least 8 characters">
          <Input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!current || !next || !confirm}>
            Change password
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PinDialog({ clearing, onClose, onDone }: { clearing: boolean; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clearing && pin !== confirm) return setError("The passphrases do not match");
    setBusy(true);
    const result = await updateDeployPin(password, clearing ? null : pin);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDone();
  };

  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 4);

  return (
    <Dialog title={clearing ? "Remove deploy passphrase" : "Deploy passphrase"} description={clearing ? "Deploys will start immediately without asking." : "Four digits, asked for on every Deploy click."} onClose={onClose} width="max-w-[420px]">
      <form onSubmit={submit} className="space-y-4">
        {!clearing && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="New passphrase">
              <Input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(digits(event.target.value))} placeholder="••••" className="text-center font-mono tracking-[0.5em]" autoFocus />
            </Field>
            <Field label="Confirm">
              <Input type="password" inputMode="numeric" value={confirm} onChange={(event) => setConfirm(digits(event.target.value))} placeholder="••••" className="text-center font-mono tracking-[0.5em]" />
            </Field>
          </div>
        )}
        <Field label="Your password" hint="to confirm it's you">
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus={clearing} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={clearing ? "danger" : "primary"} icon={<KeyRound className="size-3.5" />} busy={busy} disabled={!password || (!clearing && (pin.length !== 4 || confirm.length !== 4))}>
            {clearing ? "Remove passphrase" : "Save passphrase"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
