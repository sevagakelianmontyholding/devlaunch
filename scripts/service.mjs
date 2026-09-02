// Installs or removes the macOS LaunchAgent that keeps DevLaunch running at login.
// Usage: npm run service:install | npm run service:uninstall
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = "com.devlaunch.app";
const plistPath = path.join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const logDir = path.join(homedir(), "Library", "Logs", "DevLaunch");
const domain = `gui/${process.getuid()}`;

function readEnv() {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "").replaceAll("${HOME}", homedir());
  }
  return values;
}

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function launchctl(args, quiet = false) {
  try {
    execFileSync("launchctl", args, { stdio: quiet ? "ignore" : "inherit" });
  } catch (error) {
    if (!quiet) throw error;
  }
}

function isLoaded() {
  try {
    execFileSync("launchctl", ["print", `${domain}/${label}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function install() {
  if (process.platform !== "darwin") throw new Error("The LaunchAgent is only available on macOS.");
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) throw new Error("Build first: npm run build");
  const env = readEnv();
  const port = env.DEVLAUNCH_PORT ?? "3000";
  const node = execFileSync("sh", ["-lc", "command -v node"], { encoding: "utf8" }).trim();
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const vars = {
    PATH: `${path.dirname(node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: homedir(),
    NODE_ENV: "production",
    DEVLAUNCH_DATA_DIR: env.DEVLAUNCH_DATA_DIR ?? path.join(root, "data"),
  };
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(nextBin)}</string>
    <string>start</string>
    <string>--hostname</string><string>127.0.0.1</string>
    <string>--port</string><string>${xml(port)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(vars)
  .map(([key, value]) => `    <key>${key}</key><string>${xml(value)}</string>`)
  .join("\n")}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(path.join(logDir, "app.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logDir, "app.error.log"))}</string>
</dict>
</plist>
`;
  mkdirSync(path.dirname(plistPath), { recursive: true });
  mkdirSync(logDir, { recursive: true });
  mkdirSync(vars.DEVLAUNCH_DATA_DIR, { recursive: true });
  writeFileSync(plistPath, plist);
  launchctl(["bootout", `${domain}/${label}`], true);
  // bootout returns before the job is fully unloaded; bootstrapping too early fails.
  for (let attempt = 0; attempt < 50 && isLoaded(); attempt += 1) sleep(100);
  launchctl(["bootstrap", domain, plistPath]);
  launchctl(["kickstart", "-k", `${domain}/${label}`]);
  console.log(`DevLaunch is running at http://127.0.0.1:${port} and will start at login.`);
  console.log(`Data folder: ${vars.DEVLAUNCH_DATA_DIR}`);
}

function uninstall() {
  launchctl(["bootout", `${domain}/${label}`], true);
  rmSync(plistPath, { force: true });
  console.log("DevLaunch service removed. The data/ folder was left in place.");
}

const command = process.argv[2];
try {
  if (command === "install") install();
  else if (command === "uninstall") uninstall();
  else throw new Error("Usage: node scripts/service.mjs <install|uninstall>");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
