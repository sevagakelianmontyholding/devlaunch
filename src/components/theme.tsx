"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardTitle, Segmented } from "./ui";

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
  useEffect(() => {
    const timer = setTimeout(() => setTheme(readTheme()), 0);
    return () => clearTimeout(timer);
  }, []);
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
      <p className="mt-2 text-[11px] text-ink-faint">Saved in this browser.</p>
    </Card>
  );
}
