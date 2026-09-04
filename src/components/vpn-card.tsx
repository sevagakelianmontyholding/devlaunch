"use client";

import { Check, Copy, KeyRound, Shield, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { connectVpn, disconnectVpn, getVpnSettings, removeVpn, saveVpn } from "@/actions";
import type { VpnSettings } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, Dialog, Dot, ErrorNote, Field, Input, Spinner, Textarea, cx, timeAgo } from "./ui";

function StepDot({ done }: { done: boolean }) {
  return <Dot tone={done ? "success" : "muted"} />;
}

export function VpnCard() {
  const { status, refresh, notify } = useStatus();
  const [settings, setSettings] = useState<VpnSettings | null>(null);
  const [profile, setProfile] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    const next = await getVpnSettings();
    setSettings(next);
    setUsername((current) => current || next.username);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveVpn(profile, username, password);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setSettings(result.data);
    setProfile("");
    setPassword("");
    notify("success", "VPN settings saved");
    void refresh();
  };

  const remove = async () => {
    const result = await removeVpn();
    if (!result.ok) return notify("error", result.error);
    setSettings(result.data);
    setUsername("");
    setConfirmRemove(false);
    void refresh();
  };

  const copy = async () => {
    if (!settings) return;
    try {
      await navigator.clipboard.writeText(settings.setupCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("error", "Could not copy; select the command and copy it yourself");
    }
  };

  const recheck = async () => {
    setChecking(true);
    await load();
    setChecking(false);
  };

  const vpn = status.vpn;
  const ready = settings?.binaryFound && settings.profileSaved && settings.username && settings.passwordSaved && settings.sudoReady;

  return (
    <Card>
      <CardTitle icon={<Shield className="size-4" />} aside={settings?.profileSaved ? <VpnPill compact /> : null}>
        VPN
      </CardTitle>
      <p className="mb-3 text-[12px] text-ink-dim">
        For servers only reachable through the office OpenVPN. DevLaunch keeps the profile, username and the fixed part of the password (encrypted); you type just the code from your authenticator.
      </p>

      {settings === null ? (
        <Spinner label="Loading…" />
      ) : (
        <>
          <ol className="mb-4 space-y-1.5 text-[12px]">
            <li className="flex items-center gap-2">
              <StepDot done={settings.binaryFound} />
              OpenVPN command-line client
              {!settings.binaryFound && (
                <span className="text-ink-faint">
                  — install with <code className="rounded bg-bg px-1 font-mono text-[11px] text-accent">brew install openvpn</code>
                </span>
              )}
            </li>
            <li className="flex items-center gap-2">
              <StepDot done={settings.profileSaved} />
              Profile {settings.host ? <span className="font-mono text-[11px] text-ink-faint">{settings.host}</span> : <span className="text-ink-faint">— paste the .ovpn below</span>}
            </li>
            <li className="flex items-center gap-2">
              <StepDot done={Boolean(settings.username && settings.passwordSaved)} />
              Username and fixed password {settings.username && <span className="font-mono text-[11px] text-ink-faint">{settings.username}</span>}
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <StepDot done={settings.sudoReady} />
              Permission to open the tunnel
              {settings.sudoReady ? (
                <span className="text-ink-faint">— granted</span>
              ) : (
                <span className="text-ink-faint">— run the command below once in a terminal</span>
              )}
            </li>
          </ol>

          {!settings.sudoReady && settings.binaryFound && (
            <div className="mb-4 rounded-lg border border-line bg-bg p-3">
              <p className="text-[11px] text-ink-dim">Run this once in a terminal (it asks for your Mac password). It lets your user start and stop OpenVPN for this profile only, with exactly this command line and nothing else.</p>
              <div className="mt-2 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-black/40 px-2 py-1.5 font-mono text-[11px] text-ink">{settings.setupCommand}</code>
                <Button size="sm" icon={copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />} onClick={() => void copy()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => void recheck()} busy={checking}>
                I ran it — check again
              </Button>
            </div>
          )}

          <form onSubmit={save} className="space-y-3">
            <Field label={settings.profileSaved ? "Replace profile" : "Profile"} hint=".ovpn contents, or its path on this Mac">
              <Textarea value={profile} onChange={(event) => setProfile(event.target.value)} rows={3} spellCheck={false} placeholder={"client\ndev tun\nremote vpn.example.com 1194\n…   or   /Users/you/Downloads/me@vpn.example.com.ovpn"} className="font-mono text-[11px]" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="VPN username">
                <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" placeholder="first.last" />
              </Field>
              <Field label="Fixed password" hint={settings.passwordSaved ? "saved · leave empty to keep" : "without the code"}>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder={settings.passwordSaved ? "••••••••" : ""} />
              </Field>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" busy={saving} disabled={!username.trim() || (!settings.profileSaved && !profile.trim()) || (!settings.passwordSaved && !password)}>
                Save
              </Button>
              {settings.profileSaved && (
                <Button type="button" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmRemove(true)}>
                  Forget VPN
                </Button>
              )}
              {ready && vpn.state !== "connected" && (
                <span className="ml-auto text-[11px] text-ink-faint">Ready — connect from the dashboard.</span>
              )}
            </div>
          </form>
          {confirmRemove && (
            <div className="mt-3">
              <Confirm title="Forget the VPN settings?" body="Removes the profile, username and password from this Mac. The sudoers rule stays; delete /etc/sudoers.d/devlaunch-vpn yourself if you want it gone." confirmLabel="Forget" onCancel={() => setConfirmRemove(false)} onConfirm={() => void remove()} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// Small state pill with Connect / Disconnect, used on the dashboard header.
export function VpnPill({ compact = false }: { compact?: boolean }) {
  const { status, refresh, notify } = useStatus();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vpn = status.vpn;
  if (vpn.state === "unconfigured") return null;

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await connectVpn(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.replace(/^SETUP:/, ""));
      return;
    }
    setAsking(false);
    setCode("");
    notify("success", `VPN connected${vpn.host ? ` to ${vpn.host}` : ""}`);
    void refresh();
  };

  const disconnect = async () => {
    setBusy(true);
    const result = await disconnectVpn();
    setBusy(false);
    if (!result.ok) return notify("error", result.error);
    notify("success", "VPN disconnected");
    void refresh();
  };

  const tone = vpn.state === "connected" ? "success" : vpn.state === "connecting" ? "warn" : "muted";
  const label = vpn.state === "connected" ? `VPN on${vpn.since && !compact ? ` · ${timeAgo(vpn.since).replace(" ago", "")}` : ""}` : vpn.state === "connecting" ? "VPN connecting…" : "VPN off";

  return (
    <>
      <div className={cx("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px]", vpn.state === "connected" ? "border-success/30 bg-success/[0.06]" : "border-line bg-panel")}>
        {vpn.state === "connected" ? <ShieldCheck className="size-3.5 text-success" /> : <ShieldOff className="size-3.5 text-ink-dim" />}
        <Dot tone={tone} pulse={vpn.state === "connecting"} />
        <span className={vpn.state === "connected" ? "text-success" : "text-ink-dim"}>{label}</span>
        {vpn.state === "connected" ? (
          <button type="button" onClick={() => void disconnect()} disabled={busy} className="ml-1 text-[11px] text-ink-dim hover:text-danger disabled:opacity-50">
            Disconnect
          </button>
        ) : vpn.state === "disconnected" ? (
          <button type="button" onClick={() => setAsking(true)} className="ml-1 text-[11px] font-medium text-accent hover:underline">
            Connect
          </button>
        ) : null}
      </div>

      {asking && (
        <Dialog title="Connect to the VPN" description={`Enter the verification code from your authenticator${vpn.host ? ` for ${vpn.host}` : ""}. The username and fixed password are filled in for you.`} onClose={() => !busy && setAsking(false)} width="max-w-[380px]">
          <form onSubmit={connect} className="space-y-4">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="123456"
              autoFocus
              aria-label="Verification code"
              className="h-12 text-center font-mono text-[20px] tracking-[0.5em]"
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            {busy && <p className="text-[12px] text-ink-dim">Connecting… this takes a few seconds.</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAsking(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={<KeyRound className="size-3.5" />} busy={busy} disabled={code.length < 4}>
                Connect
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
