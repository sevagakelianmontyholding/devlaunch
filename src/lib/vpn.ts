import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";
import { decrypt, encrypt } from "./crypto";
import { dataDir } from "./db";
import { getSetting, setSetting } from "./settings";
import { run, UserError } from "./shell";
import type { VpnSettings, VpnStatus } from "./types";

// OpenVPN with a one-time code: the profile, username and fixed password live
// here (password encrypted); the user types only the code. The tunnel is
// opened by the OpenVPN CLI as root through a sudoers rule that allows exactly
// one command line (written by scripts/vpn-setup.sh).
export const vpnDir = path.join(dataDir, "vpn");
const profilePath = path.join(vpnDir, "profile.ovpn");
const authPath = path.join(vpnDir, "auth.txt");
const logPath = path.join(vpnDir, "openvpn.log");
const pidPath = path.join(vpnDir, "openvpn.pid");
const BINARIES = ["/opt/homebrew/sbin/openvpn", "/usr/local/sbin/openvpn"];

export function openvpnBinary() {
  return BINARIES.find((candidate) => existsSync(candidate)) ?? null;
}

// Must match the sudoers rule character for character.
export function openvpnArgs() {
  return ["--config", profilePath, "--auth-user-pass", authPath, "--daemon", "--log", logPath, "--writepid", pidPath, "--auth-nocache", "--data-ciphers", "AES-128-CBC:AES-256-GCM:AES-128-GCM", "--data-ciphers-fallback", "AES-128-CBC", "--allow-compression", "asym"];
}

export const disconnectArgs = ["/usr/bin/pkill", "-F", pidPath, "openvpn"];

export function setupCommand() {
  const script = path.join(process.cwd(), "scripts", "vpn-setup.sh");
  return `sudo /bin/bash ${quote(script)} ${quote(userInfo().username)} ${quote(dataDir)}`;
}

function quote(value: string) {
  return /^[A-Za-z0-9_./@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function profileHost() {
  try {
    const match = readFileSync(profilePath, "utf8").match(/^\s*remote\s+(\S+)/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function sudoAllowed(binary: string) {
  try {
    await run("sudo", ["-n", "-l", binary, ...openvpnArgs()], { timeoutMs: 8000 });
    await run("sudo", ["-n", "-l", ...disconnectArgs], { timeoutMs: 8000 });
    return true;
  } catch {
    return false;
  }
}

export async function getVpnSettings(): Promise<VpnSettings> {
  const binary = openvpnBinary();
  return {
    binaryFound: Boolean(binary),
    profileSaved: existsSync(profilePath),
    host: profileHost(),
    username: getSetting("vpn.username") ?? "",
    passwordSaved: Boolean(getSetting("vpn.password")),
    sudoReady: binary ? await sudoAllowed(binary) : false,
    setupCommand: setupCommand(),
  };
}

export function saveVpnProfile(input: string) {
  const trimmed = input.trim();
  let content = trimmed;
  if (!trimmed.includes("\n") && trimmed.startsWith("/")) {
    try {
      content = readFileSync(trimmed, "utf8");
    } catch {
      throw new UserError("Could not read that file");
    }
  }
  if (!/^\s*client\s*$/m.test(content) || !/^\s*remote\s+\S+/m.test(content)) throw new UserError("That does not look like an OpenVPN client profile (.ovpn)");
  if (content.length > 200_000) throw new UserError("The profile is too large");
  mkdirSync(vpnDir, { recursive: true, mode: 0o700 });
  writeFileSync(profilePath, content.replace(/\r\n/g, "\n"), { mode: 0o600 });
}

export function saveVpnCredentials(username: string, password: string) {
  const user = username.trim();
  if (!user || user.length > 120) throw new UserError("Enter the VPN username");
  setSetting("vpn.username", user);
  if (password) {
    if (password.length > 200) throw new UserError("The password is too long");
    setSetting("vpn.password", encrypt(password));
  } else if (!getSetting("vpn.password")) {
    throw new UserError("Enter the fixed part of the VPN password");
  }
}

export function forgetVpn() {
  setSetting("vpn.username", "");
  setSetting("vpn.password", "");
  rmSync(profilePath, { force: true });
}

function pidAlive() {
  try {
    const pid = Number(readFileSync(pidPath, "utf8").trim());
    if (!pid) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

// null when the log cannot be read (a root-owned file from an older run).
function logTail(): string | null {
  try {
    return readFileSync(logPath, "utf8").slice(-20_000);
  } catch {
    return existsSync(logPath) ? null : "";
  }
}

// OpenVPN runs as root; if it creates the log itself the file is root-only.
// Creating it first, owned by us and world-readable, keeps it readable.
function prepareFiles() {
  mkdirSync(vpnDir, { recursive: true, mode: 0o700 });
  rmSync(logPath, { force: true });
  rmSync(pidPath, { force: true });
  writeFileSync(logPath, "", { mode: 0o644 });
}

function pidAge() {
  try {
    return Date.now() - statSync(pidPath).mtimeMs;
  } catch {
    return 0;
  }
}

export function vpnStatus(): VpnStatus {
  const configured = existsSync(profilePath) && Boolean(getSetting("vpn.username")) && Boolean(getSetting("vpn.password"));
  const host = profileHost();
  const pid = pidAlive();
  if (!pid) return { state: configured ? "disconnected" : "unconfigured", host, since: null, detail: null };
  const log = logTail();
  // Unreadable log: assume connected once the daemon has stayed up a while.
  if (log === null ? pidAge() > 15_000 : log.includes("Initialization Sequence Completed")) {
    let since: string | null = null;
    try {
      since = statSync(pidPath).mtime.toISOString();
    } catch {
      // Fine without a timestamp.
    }
    return { state: "connected", host, since, detail: null };
  }
  return { state: "connecting", host, since: null, detail: null };
}

// Writes the credentials file, starts OpenVPN, and waits for the handshake.
export async function connectVpn(code: string): Promise<VpnStatus> {
  const binary = openvpnBinary();
  if (!binary) throw new UserError("The OpenVPN command-line client is not installed (brew install openvpn)");
  if (!existsSync(profilePath)) throw new UserError("Add the VPN profile in Settings first");
  const username = getSetting("vpn.username");
  const encrypted = getSetting("vpn.password");
  if (!username || !encrypted) throw new UserError("Add the VPN username and password in Settings first");
  const otp = code.trim();
  if (!/^\d{4,10}$/.test(otp)) throw new UserError("Enter the verification code from your authenticator");
  if (pidAlive()) throw new UserError("The VPN is already running");
  if (!(await sudoAllowed(binary))) throw new UserError("SETUP:Run the one-time setup command from Settings → VPN first");

  prepareFiles();
  writeFileSync(authPath, `${username}\n${decrypt(encrypted)}${otp}\n`, { mode: 0o600 });
  try {
    await run("sudo", ["-n", binary, ...openvpnArgs()], { timeoutMs: 20_000 });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const log = logTail();
      if (log === null) {
        if (pidAlive() && pidAge() > 15_000) return vpnStatus();
        continue;
      }
      if (log.includes("Initialization Sequence Completed")) return vpnStatus();
      if (/AUTH_FAILED|auth-failure/i.test(log)) throw new UserError("The VPN rejected the username, password or code");
      if (/TLS Error|Cannot resolve host|Connection refused|Exiting due to fatal error/i.test(log) && !pidAlive()) {
        const line = log.split("\n").filter(Boolean).at(-1) ?? "OpenVPN exited";
        throw new UserError(`Could not connect: ${line.replace(/^.*?\d{4} /, "").slice(0, 200)}`);
      }
      if (!pidAlive() && log.length > 0 && Date.now() > deadline - 55_000) {
        const line = log.split("\n").filter(Boolean).at(-1) ?? "OpenVPN exited";
        throw new UserError(`OpenVPN stopped: ${line.slice(-200)}`);
      }
    }
    await disconnectVpn().catch(() => undefined);
    throw new UserError("The VPN did not come up within a minute; see data/vpn/openvpn.log");
  } finally {
    rmSync(authPath, { force: true });
  }
}

export async function disconnectVpn(): Promise<VpnStatus> {
  if (!pidAlive()) return vpnStatus();
  await run("sudo", ["-n", ...disconnectArgs], { timeoutMs: 10_000 }).catch(() => {
    throw new UserError("Could not stop OpenVPN; run the setup command again");
  });
  const deadline = Date.now() + 8000;
  while (pidAlive() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 300));
  return vpnStatus();
}
