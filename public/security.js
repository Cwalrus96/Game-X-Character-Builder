// public/security.js
// Centralized "good enough" input validation/sanitization helpers.
// - Keep Firestore docs tidy (clamp lengths/ranges)
// - Reduce XSS risk by discouraging storing HTML
// - Validate portrait uploads client-side (type/size + decode check)

/**
 * Remove most control characters (except common whitespace) to avoid strange rendering issues.
 * This is not a full sanitizer; it is a "keep it clean" pass.
 */
function stripControlChars(s) {
  return String(s ?? "")
    // Remove C0/C1 controls except: \t (9), \n (10), \r (13)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
}

/** Collapse runs of whitespace into single spaces (keeps newlines out by default). */
function collapseSpaces(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function clampInt(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  const iv = Math.trunc(v);
  return Math.max(min, Math.min(max, iv));
}

export function sanitizeText(value, { maxLen = 256, collapse = false } = {}) {
  let s = stripControlChars(value);
  s = collapse ? collapseSpaces(s) : String(s).trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function sanitizeName(value) {
  // Character names are short and displayed widely.
  return sanitizeText(value, { maxLen: 64, collapse: true });
}

export function sanitizeEmailLike(value) {
  return sanitizeText(value, { maxLen: 128, collapse: true });
}

export function sanitizeUrl(value, { maxLen = 1024 } = {}) {
  const s = sanitizeText(value, { maxLen, collapse: true });
  if (!s) return "";
  // Only allow http(s) URLs (download URLs from Firebase are https).
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

export function sanitizeStoragePath(value, { maxLen = 256 } = {}) {
  const s = sanitizeText(value, { maxLen, collapse: true });
  if (!s) return "";
  // Allow only a conservative character set for paths.
  // (Your code generates these paths, but this prevents storing weird values.)
  if (!/^[a-zA-Z0-9_\-./]+$/.test(s)) return "";
  return s;
}

export function sanitizeAttributes(obj, { min = 0, max = 99 } = {}) {
  const out = {};
  const src = (obj && typeof obj === "object") ? obj : {};
  for (const k of ["strength", "agility", "intellect", "willpower", "attunement", "heart"]) {
    out[k] = clampInt(src[k], min, max);
  }
  return out;
}

/**
 * Sanitize known character patch fields.
 * NOTE: This is intentionally light-touch to keep the app flexible.
 */
export function sanitizeCharacterPatch(patch) {
  const p = (patch && typeof patch === "object") ? patch : {};
  const out = { ...p };

  // Common top-level fields
  if ("name" in out) out.name = sanitizeName(out.name);
  if ("portraitUrl" in out) out.portraitUrl = sanitizeUrl(out.portraitUrl);
  if ("portraitPath" in out) out.portraitPath = sanitizeStoragePath(out.portraitPath);

  // Builder fields (dot paths)
  if ("builder.level" in out) out["builder.level"] = clampInt(out["builder.level"], 1, 12);
  if ("builder.attributes" in out) out["builder.attributes"] = sanitizeAttributes(out["builder.attributes"]);

  // Sheet mirror fields (dot paths)
  if ("sheet.fields.level" in out) out["sheet.fields.level"] = clampInt(out["sheet.fields.level"], 1, 12);
  for (const k of ["strength", "agility", "intellect", "willpower", "attunement", "heart"]) {
    const key = `sheet.fields.${k}`;
    if (key in out) out[key] = clampInt(out[key], 0, 99);
  }

  // If we ever store a sheet portrait URL, keep it sane
  if ("sheet.portrait" in out) out["sheet.portrait"] = sanitizeUrl(out["sheet.portrait"]);

  return out;
}

// ---- Portrait upload validation ----

export const PORTRAIT_MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Intentionally disallow SVG for "good enough" safety.
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function guessSafeImageExt(file) {
  const t = String(file?.type || "").toLowerCase();
  if (t === "image/png") return "png";
  if (t === "image/jpeg") return "jpg";
  if (t === "image/webp") return "webp";
  if (t === "image/gif") return "gif";
  return "png";
}

/**
 * Validate that the file looks like a reasonable portrait image.
 * Returns {ok, message}.
 */
export async function validatePortraitFile(file) {
  if (!file) return { ok: false, message: "No file selected." };

  if (file.size > PORTRAIT_MAX_BYTES) {
    return { ok: false, message: `Image is too large. Max ${(PORTRAIT_MAX_BYTES / (1024 * 1024)).toFixed(0)}MB.` };
  }

  const type = String(file.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    return { ok: false, message: "Unsupported image type. Please use PNG, JPG, WEBP, or GIF." };
  }

  // Decode check: ensures the browser can actually parse it as an image.
  // This is a lightweight sanity check; not a cryptographic guarantee.
  const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } catch {
    return { ok: false, message: "That file could not be decoded as an image." };
  } finally {
    URL.revokeObjectURL(url);
  }

  return { ok: true, message: "" };
}
