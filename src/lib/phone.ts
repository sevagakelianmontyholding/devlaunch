import { readFileSync, writeFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import QRCode from "qrcode";
import type { PhoneAccess } from "./types";

const envFile = path.join(process.cwd(), ".env");

function bindAddress() {
  return process.env.DEVLAUNCH_BIND?.trim() || "127.0.0.1";
}

function port() {
  return process.env.DEVLAUNCH_PORT?.trim() || process.env.PORT?.trim() || "3000";
}

// Addresses another device on the same network could use.
function lanAddresses() {
  const result: string[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (name.startsWith("utun") || name.startsWith("bridge") || name.startsWith("vmnet")) continue;
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) result.push(entry.address);
    }
  }
  return result;
}

export async function phoneAccess(): Promise<PhoneAccess> {
  const bind = bindAddress();
  const open = bind !== "127.0.0.1" && bind !== "localhost";
  const local = hostname().replace(/\.local$/, "");
  const urls = open ? [`http://${local}.local:${port()}`, ...lanAddresses().map((address) => `http://${address}:${port()}`)] : [];
  const qr = urls[1] ?? urls[0];
  return {
    open,
    bind,
    port: port(),
    urls,
    qrSvg: qr ? await QRCode.toString(qr, { type: "svg", margin: 1, width: 180, color: { dark: "#ececefff", light: "#00000000" } }) : null,
  };
}

// Sets DEVLAUNCH_BIND in .env and reinstalls the login service, which restarts
// this process; the browser reloads a moment later.
export function enablePhoneAccess(enable: boolean) {
  let content = "";
  try {
    content = readFileSync(envFile, "utf8");
  } catch {
    content = "";
  }
  const line = `DEVLAUNCH_BIND=${enable ? "0.0.0.0" : "127.0.0.1"}`;
  content = /^DEVLAUNCH_BIND=.*$/m.test(content) ? content.replace(/^DEVLAUNCH_BIND=.*$/m, line) : `${content.trimEnd()}\n${line}\n`;
  writeFileSync(envFile, content.replace(/^\n+/, ""));
  const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "service.mjs"), "install"], { cwd: process.cwd(), detached: true, stdio: "ignore", env: { ...process.env } });
  child.unref();
}
