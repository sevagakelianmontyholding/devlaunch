"use client";

// Terminal font preferences, saved in this browser like the theme.
export type TerminalPrefs = { family: string; size: number };

const storageKey = "devlaunch:terminal";
export const prefsEvent = "devlaunch:terminal-prefs";
export const defaultPrefs: TerminalPrefs = { family: "Geist Mono", size: 12 };
export const fontSizes = [11, 12, 13, 14, 15] as const;

// Monospace fonts worth offering; only the installed ones are shown.
export const candidateFonts = ["Geist Mono", "Menlo", "SF Mono", "Monaco", "JetBrains Mono", "Fira Code", "Cascadia Code", "IBM Plex Mono", "Source Code Pro", "Roboto Mono", "Ubuntu Mono", "Hack", "Courier New"];

export function readPrefs(): TerminalPrefs {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<TerminalPrefs> | null;
    return {
      family: typeof stored?.family === "string" && stored.family ? stored.family : defaultPrefs.family,
      size: typeof stored?.size === "number" && fontSizes.includes(stored.size as (typeof fontSizes)[number]) ? stored.size : defaultPrefs.size,
    };
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(prefs: TerminalPrefs) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch {
    // Private mode; the choice just will not persist.
  }
  window.dispatchEvent(new CustomEvent(prefsEvent));
}

// The CSS font stack xterm should use. "Geist Mono" is the app's own font,
// loaded by next/font under a generated name found in the CSS variable.
export function fontStack(family: string) {
  if (family === "Geist Mono") {
    const generated = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim();
    return `${generated || '"Geist Mono"'}, Menlo, monospace`;
  }
  return `"${family}", Menlo, monospace`;
}

// System fonts cannot be asked about directly, so compare rendered widths
// against generic fallbacks: an installed font measures differently from both.
export function isFontInstalled(family: string) {
  if (family === "Geist Mono") return true;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return false;
  const sample = "mmmmmmmmmmlli0O1|WWW@@@";
  const width = (font: string) => {
    context.font = `24px ${font}`;
    return context.measureText(sample).width;
  };
  const monospace = width("monospace");
  const serif = width("serif");
  const candidate = width(`"${family}", monospace`);
  const candidateSerif = width(`"${family}", serif`);
  return candidate !== monospace || candidateSerif !== serif;
}
