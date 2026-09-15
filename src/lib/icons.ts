import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { dataDir, db, now } from "./db";
import { run, UserError } from "./shell";
import type { Project } from "./types";

// Project icons: found in the project folder first (favicon / app icon files),
// then fetched from the live site; either way copied into data/icons so the
// cards never depend on the network. The monogram stays the fallback.
export const iconsDir = path.join(dataDir, "icons");
const MIN_SIZE = 24;
const MAX_BYTES = 2 * 1024 * 1024;
const SUBFOLDERS = ["", "frontend", "web", "client", "app", "site", "www"];
const CANDIDATES = [
  "public/apple-touch-icon.png",
  "public/icons/icon-512.png",
  "public/icons/icon-192.png",
  "public/icon-512.png",
  "public/icon-192.png",
  "public/android-chrome-192x192.png",
  "public/logo192.png",
  "public/favicon.svg",
  "public/favicon.png",
  "public/icon.svg",
  "public/icon.png",
  "src/app/icon.svg",
  "src/app/icon.png",
  "app/icon.svg",
  "app/icon.png",
  "src/app/favicon.ico",
  "app/favicon.ico",
  "public/favicon.ico",
  "favicon.ico",
];
const TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png", ico: "image/x-icon", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

export function contentTypeFor(file: string) {
  return TYPES[path.extname(file).slice(1).toLowerCase()] ?? "application/octet-stream";
}

// Largest image size in the file, or null when it cannot be told (svg, webp, jpeg).
function imageSize(buffer: Buffer, ext: string): number | null {
  try {
    if (ext === "png") {
      const png = PNG.sync.read(buffer);
      return Math.min(png.width, png.height);
    }
    if (ext === "ico") {
      const count = buffer.readUInt16LE(4);
      let best = 0;
      for (let i = 0; i < count; i += 1) {
        const width = buffer[6 + i * 16] || 256;
        best = Math.max(best, width);
      }
      return best;
    }
  } catch {
    return 0;
  }
  return null;
}

function usable(buffer: Buffer, ext: string) {
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return false;
  const size = imageSize(buffer, ext);
  return size === null || size >= MIN_SIZE;
}

function store(projectId: string, buffer: Buffer, ext: string) {
  mkdirSync(iconsDir, { recursive: true, mode: 0o700 });
  for (const existing of readdirSync(iconsDir)) if (existing.startsWith(`${projectId}.`)) rmSync(path.join(iconsDir, existing), { force: true });
  const file = `${projectId}.${ext}`;
  writeFileSync(path.join(iconsDir, file), buffer);
  return file;
}

function findLocal(projectPath: string): { buffer: Buffer; ext: string; from: string } | null {
  for (const sub of SUBFOLDERS) {
    for (const candidate of CANDIDATES) {
      const file = path.join(projectPath, sub, candidate);
      if (!existsSync(file)) continue;
      const ext = path.extname(file).slice(1).toLowerCase();
      const buffer = readFileSync(file);
      if (usable(buffer, ext)) return { buffer, ext, from: path.join(sub, candidate) };
    }
  }
  return null;
}

async function fetchBytes(url: string) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "DevLaunch icon fetch" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, type };
}

function extFromType(type: string, url: string) {
  if (type.includes("svg")) return "svg";
  if (type.includes("png")) return "png";
  if (type.includes("icon")) return "ico";
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("webp")) return "webp";
  const ext = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  return TYPES[ext] ? ext : null;
}

async function findLive(liveUrl: string): Promise<{ buffer: Buffer; ext: string; from: string } | null> {
  const base = new URL(liveUrl);
  const candidates: Array<{ href: string; score: number }> = [];
  try {
    const { buffer } = await fetchBytes(liveUrl);
    const html = buffer.toString("utf8").slice(0, 300_000);
    for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
      const attrs = tag[0];
      const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase() ?? "";
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      if (!href || !/icon/.test(rel)) continue;
      const sizes = /sizes\s*=\s*["'](\d+)x/i.exec(attrs)?.[1];
      let score = rel.includes("apple-touch") ? 500 : 100;
      if (sizes) score += Math.min(Number(sizes), 512);
      if (/\.svg(\?|$)/i.test(href)) score += 50;
      candidates.push({ href: new URL(href, base).toString(), score });
    }
  } catch {
    // The page may be down; the plain favicon might still answer.
  }
  candidates.push({ href: new URL("/favicon.ico", base).toString(), score: 0 });
  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    try {
      const { buffer, type } = await fetchBytes(candidate.href);
      const ext = extFromType(type, candidate.href);
      if (ext && usable(buffer, ext)) return { buffer, ext, from: candidate.href };
    } catch {
      // Next candidate.
    }
  }
  return null;
}

function remember(projectId: string, file: string | null, source: string) {
  db().prepare("UPDATE projects SET icon_file = ?, icon_source = ?, updated_at = ? WHERE id = ?").run(file, source, now(), projectId);
}

// Looks for an icon locally, then on the live site. "none" is remembered so
// the automatic pass does not retry every start; Refresh tries again.
export async function refreshIcon(project: Pick<Project, "id" | "path" | "liveUrl">): Promise<{ source: string; from: string } | null> {
  const local = findLocal(path.resolve(project.path));
  if (local) {
    remember(project.id, store(project.id, local.buffer, local.ext), "local");
    return { source: "local", from: local.from };
  }
  if (project.liveUrl) {
    const live = await findLive(project.liveUrl).catch(() => null);
    if (live) {
      remember(project.id, store(project.id, live.buffer, live.ext), "live");
      return { source: "live", from: live.from };
    }
  }
  remember(project.id, null, "none");
  return null;
}

// macOS file picker; the chosen image becomes the icon regardless of size.
export async function chooseIcon(project: Pick<Project, "id">) {
  if (process.platform !== "darwin") throw new UserError("The file picker is only available on macOS");
  let chosen = "";
  try {
    const { stdout } = await run("/usr/bin/osascript", ["-e", 'POSIX path of (choose file of type {"public.image"} with prompt "Choose an icon for this project")'], { timeoutMs: 120_000 });
    chosen = stdout.trim();
  } catch {
    throw new UserError("No file was chosen");
  }
  const ext = path.extname(chosen).slice(1).toLowerCase();
  if (!TYPES[ext]) throw new UserError("Choose a PNG, SVG, ICO, JPEG or WebP file");
  const buffer = readFileSync(chosen);
  if (buffer.length > MAX_BYTES) throw new UserError("That image is larger than 2 MB");
  remember(project.id, store(project.id, buffer, ext), "custom");
}

export function clearIcon(projectId: string) {
  for (const existing of readdirSync(iconsDir).filter((file) => file.startsWith(`${projectId}.`))) rmSync(path.join(iconsDir, existing), { force: true });
  remember(projectId, null, "none");
}

export function iconFile(projectId: string, file: string | null) {
  if (!file) return null;
  const full = path.join(iconsDir, file);
  try {
    return { path: full, version: Math.round(statSync(full).mtimeMs) };
  } catch {
    return null;
  }
}

// Background pass at startup for projects that have never been looked at.
const globalState = globalThis as unknown as { devlaunchIconsPass?: boolean };
export function ensureIcons(projects: Array<Pick<Project, "id" | "path" | "liveUrl" | "iconSource">>) {
  if (globalState.devlaunchIconsPass) return;
  globalState.devlaunchIconsPass = true;
  void (async () => {
    for (const project of projects) {
      if (project.iconSource) continue;
      await refreshIcon(project).catch(() => undefined);
    }
  })();
}
