"use client";

import { Moon, SquareTerminal, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { candidateFonts, fontSizes, fontStack, isFontInstalled, readPrefs, savePrefs, type TerminalPrefs } from "./terminal-prefs";
import { Card, CardTitle, Field, Segmented, Select } from "./ui";

type Theme = "dark" | "light";
const storageKey = "devlaunch:theme";

export function readTheme(): Theme {
  try {
    return window.localStorage.getItem(storageKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Private mode; the choice just will not persist.
  }
}

export function ThemeCard() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [prefs, setPrefs] = useState<TerminalPrefs>({ family: "Geist Mono", size: 12 });
  const [fonts, setFonts] = useState<string[]>(["Geist Mono"]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTheme(readTheme());
      const current = readPrefs();
      setPrefs(current);
      const installed = candidateFonts.filter(isFontInstalled);
      setFonts(installed.includes(current.family) ? installed : [...installed, current.family]);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const update = (next: TerminalPrefs) => {
    setPrefs(next);
    savePrefs(next);
  };
  return (
    <Card>
      <CardTitle icon={theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}>Appearance</CardTitle>
      <Segmented
        value={theme}
        onChange={(next) => {
          setTheme(next);
          applyTheme(next);
        }}
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
        ]}
      />
      <div className="mt-4 flex items-center gap-2 text-[12px] font-medium">
        <SquareTerminal className="size-3.5 text-accent" /> Terminal
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Font" hint="installed monospace fonts">
          <Select value={prefs.family} onChange={(event) => update({ ...prefs, family: event.target.value })}>
            {fonts.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Size">
          <div className="pt-0.5">
            <Segmented value={String(prefs.size)} onChange={(value) => update({ ...prefs, size: Number(value) })} options={fontSizes.map((size) => ({ value: String(size), label: String(size) }))} />
          </div>
        </Field>
      </div>
      <p className="mt-2 rounded-lg border border-line bg-[#07070a] px-3 py-2 text-ink" style={{ fontFamily: fontStack(prefs.family), fontSize: prefs.size }}>
        $ docker compose up -d <span className="text-success">✔</span> 0 → O, 1 → l → I, {"{}"} [] ()
      </p>
      <p className="mt-2 text-[11px] text-ink-faint">Saved in this browser.</p>
    </Card>
  );
}
