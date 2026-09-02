// Builds data/DevLaunch Notifier.app: a tiny AppleScript applet that posts a
// macOS notification read from data/notify.txt. Notifications are attributed to
// the sending app, so this is what makes them carry the DevLaunch icon.
// Usage: node scripts/notifier.mjs [dataDir]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(process.argv[2] ?? path.join(root, "data"));
const app = path.join(dataDir, "DevLaunch Notifier.app");
const work = path.join(dataDir, ".notifier-build");
const messageFile = path.join(dataDir, "notify.txt");

mkdirSync(work, { recursive: true });

// 1. Compile the applet. It reads title / message / sound from notify.txt.
const script = `on run
  set messagePath to POSIX file "${messageFile.replaceAll('"', '\\"')}"
  try
    set content to read messagePath as «class utf8»
  on error
    return
  end try
  set lines to paragraphs of content
  set theTitle to item 1 of lines
  set theMessage to item 2 of lines
  set theSound to item 3 of lines
  if theSound is "" then
    display notification theMessage with title theTitle
  else
    display notification theMessage with title theTitle sound name theSound
  end if
end run
`;
const scriptPath = path.join(work, "notifier.applescript");
writeFileSync(scriptPath, script);
rmSync(app, { recursive: true, force: true });
execFileSync("osacompile", ["-o", app, scriptPath]);

// 2. Render the SVG icon to an .icns via a Quick Look thumbnail + iconutil.
const svg = path.join(root, "src", "app", "icon.svg");
const iconset = path.join(work, "DevLaunch.iconset");
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });
execFileSync("qlmanage", ["-t", "-s", "1024", "-o", work, svg], { stdio: "ignore" });
const rendered = path.join(work, "icon.svg.png");
if (!existsSync(rendered)) throw new Error("Could not render the icon");
for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
  execFileSync("sips", ["-z", String(size), String(size), rendered, "--out", path.join(iconset, `icon_${size}x${size}.png`)], { stdio: "ignore" });
  if (size >= 32) {
    execFileSync("sips", ["-z", String(size), String(size), rendered, "--out", path.join(iconset, `icon_${size / 2}x${size / 2}@2x.png`)], { stdio: "ignore" });
  }
}
rmSync(path.join(iconset, "icon_1024x1024.png"), { force: true });
execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(app, "Contents", "Resources", "applet.icns")]);

// 3. Name it and hide it from the Dock.
const plist = path.join(app, "Contents", "Info.plist");
const set = (key, value, type = "string") => execFileSync("plutil", ["-replace", key, `-${type}`, value, plist]);
set("CFBundleIdentifier", "com.devlaunch.notifier");
set("CFBundleName", "DevLaunch");
set("CFBundleDisplayName", "DevLaunch");
set("LSUIElement", "true", "bool");
execFileSync("touch", [app]);
rmSync(work, { recursive: true, force: true });
console.log(`Built ${app}`);
