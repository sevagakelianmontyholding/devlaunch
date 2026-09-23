// Helpers for handing an environment file to `docker build` without touching
// the project's Dockerfile.
//
// Docker only passes a --build-arg into a build when the Dockerfile declares
// a matching ARG, so DevLaunch writes a copy of the Dockerfile with an ARG
// line for every variable after each FROM, and builds from that copy. Inside
// each stage the ARGs are ordinary environment variables for RUN steps, which
// is exactly what a build on the server used to see with the .env file lying
// in the folder.

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type EnvVar = { name: string; value: string };

// Parses dotenv-style text: blank lines and comments are skipped, an
// optional `export ` prefix is dropped, and matching surrounding quotes are
// removed. Anything that is not NAME=value is ignored.
export function parseEnvFile(text: string): EnvVar[] {
  const vars: EnvVar[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const name = line.slice(0, eq).trim().replace(/^export\s+/, "");
    if (!NAME.test(name)) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    vars.push({ name, value });
  }
  return vars;
}

// Returns the Dockerfile with `ARG name` lines inserted after the FROM of
// every stage that needs them. The last stage of a multi-stage Dockerfile is
// the shipped image and usually only copies the build output, so it is left
// alone unless it runs a build itself: an ARG declared there would record
// the value in the image history. Parser directives (`# syntax=…`), heredoc
// bodies and continued lines are left alone.
export function declareArgs(dockerfile: string, names: string[]): string {
  const unique = [...new Set(names.filter((name) => NAME.test(name)))];
  if (unique.length === 0) return dockerfile;
  const declaration = `# added by DevLaunch: environment file variables for this build\n${unique.map((name) => `ARG ${name}`).join("\n")}`;

  // Split into stages, remembering where each FROM instruction ends.
  type Stage = { lines: string[]; fromEnd: number | null };
  const stages: Stage[] = [{ lines: [], fromEnd: null }];
  let heredoc: string | null = null;
  let continuation: "none" | "from" | "other" = "none";
  for (const line of dockerfile.replace(/\r\n/g, "\n").split("\n")) {
    let stage = stages[stages.length - 1]!;
    if (heredoc !== null) {
      stage.lines.push(line);
      if (line.trim() === heredoc) heredoc = null;
      continue;
    }
    if (continuation !== "none") {
      stage.lines.push(line);
      if (!line.trimEnd().endsWith("\\")) {
        if (continuation === "from") stage.fromEnd = stage.lines.length;
        continuation = "none";
      }
      continue;
    }
    const isFrom = /^\s*FROM\b/i.test(line);
    if (isFrom) {
      stage = { lines: [], fromEnd: null };
      stages.push(stage);
    }
    stage.lines.push(line);
    const opening = line.match(/<<-?\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/);
    if (opening && /^\s*(RUN|COPY|ADD)\b/i.test(line)) {
      heredoc = opening[1]!;
      continue;
    }
    if (line.trimEnd().endsWith("\\")) {
      continuation = isFrom ? "from" : "other";
      continue;
    }
    if (isFrom) stage.fromEnd = stage.lines.length;
  }

  const real = stages.filter((stage) => stage.fromEnd !== null);
  const runsBuild = (stage: Stage) => stage.lines.some((line) => /^\s*RUN\b/i.test(line) && /\bbuild\b/i.test(line));
  const out: string[] = [];
  stages.forEach((stage) => {
    const index = real.indexOf(stage);
    const last = index === real.length - 1;
    const declare = index !== -1 && (real.length === 1 || !last || runsBuild(stage));
    stage.lines.forEach((line, i) => {
      out.push(line);
      if (declare && i + 1 === stage.fromEnd) out.push(declaration);
    });
  });
  return out.join("\n");
}
