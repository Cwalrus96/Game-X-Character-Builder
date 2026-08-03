import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const action = process.argv[2] || "help";
const root = process.cwd();
const stateDir = path.join(root, ".firebase");
const pidFile = path.join(stateDir, "emulators.pid");
const logFile = path.join(stateDir, "emulators.log");
const dataDir = path.join(stateDir, "local-data");
const dataMetadataFile = path.join(dataDir, "firebase-export-metadata.json");
const firebaseBin = path.join(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");

const emulatorArgs = ["emulators:start", "--only", "hosting,auth,firestore,storage"];
const emulatorPorts = [4000, 5000, 8080, 9099, 9199, 4400, 4500, 9150];
const appUrl = "http://127.0.0.1:5000";
const uiUrl = "http://127.0.0.1:4000";

function ensureStateDir() {
  fs.mkdirSync(stateDir, { recursive: true });
}

function readPid() {
  try {
    const value = fs.readFileSync(pidFile, "utf8").trim();
    const pid = Number(value);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function removePidFile() {
  try {
    fs.rmSync(pidFile, { force: true });
  } catch {
    // Nothing useful to report.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function waitForHttp(url, timeoutMs = 60000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(attempt, 500);
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    };

    attempt();
  });
}

async function isHttpReady(url) {
  try {
    await waitForHttp(url, 1000);
    return true;
  } catch {
    return false;
  }
}

function getWindowsEmulatorPortOwners() {
  const portList = emulatorPorts.join(",");
  const command = `$ports = @(${portList}); $owners = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 } | Select-Object -ExpandProperty OwningProcess -Unique; $owners -join ","`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
  });

  return result.stdout
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function getEmulatorPortOwners() {
  if (process.platform === "win32") {
    return getWindowsEmulatorPortOwners();
  }

  const lsof = spawnSync("lsof", ["-ti", `tcp:${emulatorPorts.join(",")}`], {
    encoding: "utf8",
  });

  return lsof.stdout
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function waitForEmulatorPortsToClear(timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (getEmulatorPortOwners().length === 0) return true;
    await sleep(500);
  }

  return getEmulatorPortOwners().length === 0;
}

function printLogTail() {
  if (!fs.existsSync(logFile)) return;
  const lines = fs.readFileSync(logFile, "utf8").split(/\r?\n/).slice(-40);
  console.log(lines.join("\n"));
}

function hasExportedEmulatorData() {
  return fs.existsSync(dataMetadataFile);
}

function exportEmulatorData() {
  if (!fs.existsSync(firebaseBin) || getEmulatorPortOwners().length === 0) return true;

  ensureStateDir();
  console.log(`Saving local emulator data to ${dataDir}...`);
  const result = spawnSync(process.execPath, [
    firebaseBin,
    "emulators:export",
    dataDir,
    "--force",
  ], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status === 0) {
    console.log("Local emulator data saved.");
    return true;
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  console.warn("Could not export local emulator data before stopping.");
  if (output) console.warn(output);
  return false;
}

function killProcessTree(pid) {
  if (!pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The process is already gone.
    }
  }
}

function stopProcessesOnEmulatorPorts() {
  if (process.platform === "win32") {
    const portList = emulatorPorts.join(",");
    const command = `$ports = @(${portList}); $owners = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 } | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $owners) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }`;

    spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { stdio: "ignore" });
    return;
  }

  const lsof = spawnSync("lsof", ["-ti", `tcp:${emulatorPorts.join(",")}`], {
    encoding: "utf8",
  });

  const pids = lsof.stdout
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

  for (const pid of new Set(pids)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore processes that disappeared between lookup and stop.
    }
  }
}

async function start() {
  ensureStateDir();

  const existingPid = readPid();
  if (isPidRunning(existingPid)) {
    if (await isHttpReady(appUrl)) {
      console.log(`Firebase emulators already look started. App: ${appUrl}`);
      console.log(`Emulator UI: ${uiUrl}`);
      return;
    }

    console.log("Found a stale emulator starter process. Cleaning it up before starting again.");
    killProcessTree(existingPid);
    stopProcessesOnEmulatorPorts();
    await waitForEmulatorPortsToClear();
    removePidFile();
  }

  if (await isHttpReady(appUrl)) {
    console.log(`Firebase emulators already look started. App: ${appUrl}`);
    console.log(`Emulator UI: ${uiUrl}`);
    console.log("Run npm run local:stop when you want to stop them.");
    return;
  }

  if (!fs.existsSync(firebaseBin)) {
    console.error("Firebase CLI was not found in node_modules. Run npm install first.");
    process.exitCode = 1;
    return;
  }

  const logFd = fs.openSync(logFile, "a");
  fs.appendFileSync(logFile, `\n\n[${new Date().toISOString()}] Starting Firebase emulators...\n`);

  const command = process.execPath;
  const args = [firebaseBin, ...emulatorArgs, "--export-on-exit", dataDir];
  if (hasExportedEmulatorData()) {
    args.push("--import", dataDir);
  }

  const child = spawn(command, args, {
    cwd: root,
    detached: true,
    shell: false,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });

  fs.writeFileSync(pidFile, `${child.pid}\n`);
  child.unref();

  try {
    await waitForHttp(appUrl);
    console.log("Firebase emulators started.");
    console.log(`App: ${appUrl}`);
    console.log(`Emulator UI: ${uiUrl}`);
    console.log(`Log: ${logFile}`);
  } catch (error) {
    console.error(error.message);
    console.error(`Check the log: ${logFile}`);
    printLogTail();
    process.exitCode = 1;
  } finally {
    fs.closeSync(logFd);
  }
}

async function stop() {
  const pid = readPid();

  exportEmulatorData();

  stopProcessesOnEmulatorPorts();
  await sleep(500);

  if (pid && isPidRunning(pid)) {
    killProcessTree(pid);
  }

  stopProcessesOnEmulatorPorts();
  const portsCleared = await waitForEmulatorPortsToClear();

  removePidFile();

  if (!portsCleared || await isHttpReady(appUrl)) {
    const owners = getEmulatorPortOwners();
    console.error("Tried to stop the Firebase emulators, but emulator ports are still in use.");
    if (owners.length > 0) console.error(`Remaining process IDs: ${owners.join(", ")}`);
    console.error("Run npm run local:logs for details.");
    process.exitCode = 1;
    return false;
  }

  console.log("Firebase emulators stopped.");
  return true;
}

async function restart() {
  const stopped = await stop();
  if (!stopped) return;
  await sleep(3000);
  await start();
}

async function status() {
  const pid = readPid();
  if (isPidRunning(pid)) {
    if (await isHttpReady(appUrl)) {
      console.log(`Firebase emulators are running. PID: ${pid}`);
      console.log(`App: ${appUrl}`);
      console.log(`Emulator UI: ${uiUrl}`);
      console.log(`Log: ${logFile}`);
      return;
    }

    console.log(`An emulator starter process exists, but Hosting is not responding. PID: ${pid}`);
    console.log(`Log: ${logFile}`);
    return;
  }

  if (await isHttpReady(appUrl)) {
    console.log("Firebase emulators are running.");
    console.log(`App: ${appUrl}`);
    console.log(`Emulator UI: ${uiUrl}`);
    console.log("No wrapper pid file is present, but local Hosting is responding.");
    return;
  }

  console.log("Firebase emulators are not running.");
}

function logs() {
  if (!fs.existsSync(logFile)) {
    console.log("No emulator log exists yet.");
    return;
  }
  printLogTail();
}

function help() {
  console.log([
    "Usage: node scripts/firebase-local.mjs <command>",
    "",
    "Commands:",
    "  start    Start local Firebase emulators in the background",
    "  stop     Stop local Firebase emulators",
    "  restart  Stop then start local Firebase emulators",
    "  status   Show local emulator status",
    "  logs     Show the recent emulator log",
  ].join("\n"));
}

switch (action) {
  case "start":
    await start();
    break;
  case "stop":
    await stop();
    break;
  case "restart":
    await restart();
    break;
  case "status":
    await status();
    break;
  case "logs":
    logs();
    break;
  default:
    help();
    process.exitCode = action === "help" ? 0 : 1;
}
