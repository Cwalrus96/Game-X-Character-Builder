import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const testsDirectory = path.join(repositoryRoot, "tests");

const testFiles = (await readdir(testsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => name.endsWith(".test.mjs") && !name.endsWith(".rules.test.mjs"))
  .sort()
  .map((name) => path.join("tests", name));

if (!testFiles.length) {
  console.error("No unit test files were found.");
  process.exitCode = 1;
} else {
  const child = spawn(process.execPath, ["--test", ...testFiles], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  child.on("error", (error) => {
    console.error(`Could not start unit tests: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Unit tests stopped by signal ${signal}.`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = Number.isInteger(code) ? code : 1;
  });
}
