import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev:server"], { stdio: "inherit", shell: process.platform === "win32" }),
  spawn(npm, ["run", "dev:client"], { stdio: "inherit", shell: process.platform === "win32" }),
];

let closing = false;
function close(exitCode = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      // npm.cmd runs through cmd.exe; terminate that full tree so watch processes do not linger.
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.once("exit", (code, signal) => {
    if (!closing && signal === null && code !== 0) close(code ?? 1);
  });
  child.once("error", () => close(1));
}

process.once("SIGINT", () => close());
process.once("SIGTERM", () => close());
