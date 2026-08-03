import {
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applicationDefault,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import {
  assertCredentialOutsideRepository,
  buildGmCustomClaims,
  parseSetGmArgs,
} from "./credential-policy.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = realpathSync(path.resolve(scriptDirectory, "..", ".."));

function printUsage() {
  console.log([
    "Usage:",
    "  npm run admin:set-gm -- <email> <true|false> [--project-id <id>] [--dry-run]",
    "",
    "Authentication:",
    "  Uses Application Default Credentials. If GOOGLE_APPLICATION_CREDENTIALS is set,",
    "  the referenced credential file must resolve outside this repository.",
  ].join("\n"));
}

function getCredential() {
  const configuredPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!configuredPath) return applicationDefault();

  const resolvedPath = path.resolve(configuredPath);
  assertCredentialOutsideRepository(repositoryRoot, resolvedPath);
  if (!existsSync(resolvedPath)) {
    throw new Error("The configured Google credential file does not exist.");
  }
  if (!statSync(resolvedPath).isFile()) {
    throw new Error("The configured Google credential path is not a file.");
  }

  const realCredentialPath = realpathSync(resolvedPath);
  assertCredentialOutsideRepository(repositoryRoot, realCredentialPath);
  return applicationDefault();
}

function getSafeErrorMessage(error) {
  let message = String(error?.message || "Unknown error.");
  const configuredPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  const sensitivePaths = new Set([configuredPath]);
  if (configuredPath) {
    sensitivePaths.add(path.resolve(configuredPath));
    try {
      sensitivePaths.add(realpathSync(path.resolve(configuredPath)));
    } catch (_error) {
      // A missing or inaccessible path is already described by a safe policy error.
    }
  }
  for (const sensitivePath of sensitivePaths) {
    if (sensitivePath) message = message.replaceAll(sensitivePath, "[credential path]");
  }
  return message;
}

async function main() {
  const args = parseSetGmArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const projectId = args.projectId
    || String(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "").trim();
  const options = { credential: getCredential() };
  if (projectId) options.projectId = projectId;

  const app = initializeApp(options);
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(args.email);
  const nextClaims = buildGmCustomClaims(user.customClaims, args.enabled);

  if (args.dryRun) {
    console.log(`Dry run: would ${args.enabled ? "enable" : "disable"} GM access for ${args.email}.`);
    return;
  }

  await auth.setCustomUserClaims(user.uid, nextClaims);
  const updated = await auth.getUser(user.uid);
  const updatedValue = updated.customClaims?.gm === true;
  if (updatedValue !== args.enabled) {
    throw new Error("Firebase did not return the expected GM claim after the update.");
  }

  console.log(`${args.enabled ? "Enabled" : "Disabled"} GM access for ${args.email}.`);
  console.log("The user must sign in again or refresh their ID token before the change is visible.");
}

main().catch((error) => {
  console.error(`Admin command failed: ${getSafeErrorMessage(error)}`);
  process.exitCode = 1;
});
