import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The verified production controller from Hosting version ff9730b38f571322.
export const DEPLOYED_CLASS_CONTROLLER_SHA256 = "d56e36902671a18a33fbec9c3c3b7beefc07ceae94cba20f1b0c7344b684a80e";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function replaceOnce(source, pattern, replacement, description) {
  const matches = [...source.matchAll(new RegExp(pattern.source, "g"))];
  if (matches.length !== 1) throw new Error(`Expected exactly one ${description}; found ${matches.length}.`);
  return source.replace(pattern, replacement);
}

const LEAF_PATCH_HELPER = `function buildClassSavePatch(patch) {
  // Sanitize before expanding: the legacy writer sanitizes whole skill maps,
  // while dotted leaves must already contain their canonical values.
  const cleaned = sanitizeUpdatePatch(patch);
  const fieldPath = "builder.sheet.fields";
  if (Object.prototype.hasOwnProperty.call(cleaned, fieldPath)) {
    const fields = cleaned[fieldPath];
    delete cleaned[fieldPath];
    for (const [key, value] of Object.entries(fields)) {
      cleaned[fieldPath + "." + key] = value;
    }
  }
  const repeatablePath = "builder.sheet.repeatables";
  if (Object.prototype.hasOwnProperty.call(cleaned, repeatablePath)) {
    const repeatables = cleaned[repeatablePath];
    delete cleaned[repeatablePath];
    for (const key of ["combatSkillsExtra", "settingSkills", "abilities"]) {
      if (Object.prototype.hasOwnProperty.call(repeatables, key)) {
        cleaned[repeatablePath + "." + key] = repeatables[key];
      }
    }
  }
  return cleaned;
}

`;

export function prepareClassSaveHotfix(source, { expectedSha256 = DEPLOYED_CLASS_CONTROLLER_SHA256 } = {}) {
  const sourceSha256 = sha256(source);
  if (sourceSha256 !== expectedSha256) {
    throw new Error(`Refusing an unreviewed Class controller: expected ${expectedSha256}, received ${sourceSha256}.`);
  }
  let code = replaceOnce(source,
    /import \{ sanitizeText \} from "\.\.\/core\/data-sanitization\.js";(\r?\n)/,
    (_, newline) => `import { sanitizeText } from "../core/data-sanitization.js";${newline}import { sanitizeUpdatePatch } from "../core/database-writer.js";${newline}`,
    "sanitizer import");
  code = replaceOnce(code, /  collectSelectedEntries,(\r?\n)/,
    (_, newline) => `  collectSelectedEntries,${newline}  getEntryRequiredLevel,${newline}`,
    "option-level helper import");
  code = replaceOnce(code,
    /function computeVisibleFeats\(classKey, level\) \{\r?\n  const all = getGameXFeats\(gameData\);\r?\n  const L = clampLevel\(level\);\r?\n  return all\r?\n    \.filter\(\(f\) => String\(f\?\.classKey \|\| ""\) === String\(classKey\)\)\r?\n    \.filter\(\(f\) => Number\(f\?\.minLevel \|\| 0\) <= L\);\r?\n\}/,
    (original) => {
      const newline = original.includes("\r\n") ? "\r\n" : "\n";
      return [
        "function computeVisibleFeats(classKey, level) {",
        "  const all = getGameXFeatsForClass(gameData, classKey);",
        "  const L = clampLevel(level);",
        "  return all.filter((feat) => getEntryRequiredLevel(feat) <= L);",
        "}",
      ].join(newline);
    }, "legacy visible-feat lookup");
  code = replaceOnce(code, /\.filter\(\(feat\) => Number\(feat\?\.minLevel \|\| 0\) <= L\)/,
    ".filter((feat) => getEntryRequiredLevel(feat) <= L)", "widget feat-level check");
  code = replaceOnce(code, /async function saveClassStep\(/,
    `${LEAF_PATCH_HELPER}async function saveClassStep(`, "Class save handler");
  code = replaceOnce(code, /const patch = \{ \.\.\.reconciliation\.patch, \.\.\.staticPatch \};/,
    "const patch = buildClassSavePatch({ ...reconciliation.patch, ...staticPatch });", "combined Class save patch");
  return Object.freeze({ code, sourceSha256, outputSha256: sha256(code) });
}

async function main(args) {
  if (args.length !== 4 || args[0] !== "--source" || args[2] !== "--output") {
    throw new Error("Usage: node scripts/prepare-class-save-hotfix.mjs --source <captured controller> --output <ignored staging controller>");
  }
  const sourcePath = path.resolve(args[1]);
  const outputPath = path.resolve(args[3]);
  const staging = path.resolve(".staging");
  const relative = path.relative(staging, outputPath);
  if (sourcePath === outputPath || !relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Output must be a separate file beneath the repository's ignored .staging directory.");
  }
  const prepared = prepareClassSaveHotfix(await readFile(sourcePath, "utf8"));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, prepared.code);
  console.log(JSON.stringify({ sourcePath, outputPath, sourceSha256: prepared.sourceSha256, outputSha256: prepared.outputSha256 }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
