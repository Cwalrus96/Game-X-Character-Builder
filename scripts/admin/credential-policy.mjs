import path from "node:path";

export function isPathInsideDirectory(directoryPath, candidatePath) {
  const root = path.resolve(directoryPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertCredentialOutsideRepository(repositoryRoot, credentialPath) {
  if (isPathInsideDirectory(repositoryRoot, credentialPath)) {
    throw new Error("Refusing to use a credential file stored inside the repository.");
  }
  return credentialPath;
}

export function buildGmCustomClaims(currentClaims, enabled) {
  const nextClaims = currentClaims && typeof currentClaims === "object"
    ? { ...currentClaims }
    : {};
  if (enabled) nextClaims.gm = true;
  else delete nextClaims.gm;
  return nextClaims;
}

export function parseSetGmArgs(argv = []) {
  const args = Array.from(argv, (value) => String(value || ""));
  const positional = [];
  let dryRun = false;
  let help = false;
  let projectId = "";

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (value === "--help" || value === "-h") {
      help = true;
      continue;
    }
    if (value === "--project-id") {
      projectId = String(args[index + 1] || "").trim();
      index += 1;
      if (!projectId) throw new Error("--project-id requires a value.");
      continue;
    }
    if (value.startsWith("--")) throw new Error(`Unknown option: ${value}`);
    positional.push(value);
  }

  if (help) return Object.freeze({ help: true, dryRun, projectId, email: "", enabled: false });
  if (positional.length !== 2) {
    throw new Error("Expected an email address and exactly one true/false GM value.");
  }

  const email = positional[0].trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid user email address is required.");
  }

  const rawEnabled = positional[1].trim().toLowerCase();
  if (rawEnabled !== "true" && rawEnabled !== "false") {
    throw new Error("The GM value must be exactly true or false.");
  }

  return Object.freeze({
    help: false,
    dryRun,
    projectId,
    email,
    enabled: rawEnabled === "true",
  });
}
