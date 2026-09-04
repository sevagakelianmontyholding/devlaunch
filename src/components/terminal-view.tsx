"use client";

import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { cx } from "./ui";

// A real terminal (xterm.js). Two modes:
// - runId: follows a local run live over server-sent events; keystrokes typed
//   into it go to the process, so prompts and menus work like in a terminal.
// - text: renders a plain log (deploy runs, compose logs) and appends as it grows.
type Props = { runId?: string; text?: string; rows?: number; className?: string; interactive?: boolean };

function readTheme() {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const light = document.documentElement.dataset.theme === "light";
  return {
    background: light ? "#f0f0f3" : "#07070a",
    foreground: get("--color-ink", "#ececef"),
    cursor: get("--color-accent", "#2dd4bf"),
    cursorAccent: light ? "#ffffff" : "#000000",
    selectionBackground: light ? "rgba(13,148,136,0.25)" : "rgba(45,212,191,0.3)",
    black: light ? "#17171c" : "#0b0b0d",
    brightBlack: light ? "#5b5b66" : "#62626d",
    white: light ? "#8f8f9a" : "#c9c9d0",
    brightWhite: light ? "#17171c" : "#ffffff",
  };
}

export function TerminalView({ runId, text, rows = 16, className, interactive = Boolean(runId) }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const writtenRef = useRef("");
  const [ready, setReady] = useState(0);

  // Mount the terminal once per run.
  useEffect(() => {
    let disposed = false;
    let term: Terminal | null = null;
    let observer: MutationObserver | null = null;
    let resize: ResizeObserver | null = null;
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !containerRef.current) return;
      term = new Terminal({
        rows,
        cols: 100,
        fontSize: 12,
        lineHeight: 1.2,
        fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace",
        theme: readTheme(),
        cursorBlink: interactive,
        cursorStyle: interactive ? "bar" : "underline",
        disableStdin: !interactive,
        convertEol: true,
        scrollback: 5000,
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      try {
        fit.fit();
      } catch {
        // Hidden container: the observer refits once it has a size.
      }
      termRef.current = term;
      writtenRef.current = "";
      // Handy for debugging from the console: element.terminal.buffer.active
      (containerRef.current as HTMLDivElement & { terminal?: Terminal }).terminal = term;
      observer = new MutationObserver(() => {
        if (term) term.options.theme = readTheme();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      resize = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          // Ignore transient layout states.
        }
      });
      resize.observe(containerRef.current);
      setReady((count) => count + 1);
    })();
    return () => {
      disposed = true;
      observer?.disconnect();
      resize?.disconnect();
      term?.dispose();
      termRef.current = null;
    };
  }, [runId, rows, interactive]);

  // Live mode: stream the run and forward keystrokes.
  useEffect(() => {
    const term = termRef.current;
    if (!runId || !term || ready === 0) return;
    const source = new EventSource(`/api/local-runs/${runId}/stream`);
    source.addEventListener("init", (event) => {
      const { log } = JSON.parse((event as MessageEvent).data) as { log: string };
      term.reset();
      term.write(log);
    });
    source.addEventListener("chunk", (event) => term.write(JSON.parse((event as MessageEvent).data) as string));
    source.addEventListener("done", () => source.close());
    source.onerror = () => {
      // The stream ends when the run finishes; nothing to retry.
      if (source.readyState === EventSource.CLOSED) return;
    };
    const input = term.onData((data) => {
      void fetch(`/api/local-runs/${runId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: data, raw: true }) });
    });
    return () => {
      input.dispose();
      source.close();
    };
  }, [runId, ready]);

  // Text mode: append what is new, or redraw when the text changed elsewhere.
  useEffect(() => {
    const term = termRef.current;
    if (runId || text === undefined || !term || ready === 0) return;
    const previous = writtenRef.current;
    if (text.startsWith(previous)) {
      term.write(text.slice(previous.length));
    } else {
      term.reset();
      term.write(text);
    }
    writtenRef.current = text;
  }, [text, runId, ready]);

  return (
    <div
      ref={containerRef}
      onClick={() => interactive && termRef.current?.focus()}
      className={cx("overflow-hidden rounded-lg border border-line p-2", interactive ? "cursor-text" : "", className)}
      style={{ background: "var(--terminal-bg, #07070a)" }}
    />
  );
}
