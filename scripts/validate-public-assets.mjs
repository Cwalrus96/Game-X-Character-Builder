#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = path.resolve(scriptDirectory, "..", "public");

function walkHtmlFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkHtmlFiles(fullPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) files.push(fullPath);
  }
  return files;
}

function localReferenceTarget(reference, htmlPath, publicDirectory) {
  const raw = String(reference || "").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("?") || raw.includes("${")) return null;
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)) return null;

  const withoutQuery = raw.split(/[?#]/, 1)[0];
  if (!withoutQuery) return null;
  const decoded = decodeURIComponent(withoutQuery);
  const target = decoded.startsWith("/")
    ? path.resolve(publicDirectory, `.${decoded}`)
    : path.resolve(path.dirname(htmlPath), decoded);
  return decoded.endsWith("/") || decoded === "/" ? path.join(target, "index.html") : target;
}

export function validatePublicAssets(publicDirectory = defaultPublicDirectory) {
  const failures = [];
  const attributePattern = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;

  for (const htmlPath of walkHtmlFiles(publicDirectory)) {
    const html = fs.readFileSync(htmlPath, "utf8");
    for (const match of html.matchAll(attributePattern)) {
      const target = localReferenceTarget(match[2], htmlPath, publicDirectory);
      if (target && !fs.existsSync(target)) {
        failures.push({
          html: path.relative(publicDirectory, htmlPath),
          reference: match[2],
          target: path.relative(publicDirectory, target),
        });
      }
    }
  }

  return failures;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const publicDirectory = process.argv[2] ? path.resolve(process.argv[2]) : defaultPublicDirectory;
  const failures = validatePublicAssets(publicDirectory);
  if (failures.length) {
    console.error("Broken local asset references:");
    for (const failure of failures) {
      console.error(`- ${failure.html}: ${failure.reference} -> ${failure.target}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Static asset validation passed (${walkHtmlFiles(publicDirectory).length} HTML files).`);
  }
}
