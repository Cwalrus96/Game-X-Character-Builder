/** Character-owned presentation preferences. No class or game-rule dependency. */
export const HEADING_FONTS = Object.freeze({
  clean: { label: "Clean sans serif", css: 'Arial, Helvetica, sans-serif' },
  book: { label: "Book serif", css: 'Georgia, "Times New Roman", serif' },
  rounded: { label: "Soft rounded", css: '"Trebuchet MS", Arial, sans-serif' },
  mono: { label: "Technical mono", css: 'Consolas, "Courier New", monospace' },
  bold: { label: "Bold display", css: '"Arial Black", Arial, sans-serif' },
});
export const DICE_THEMES = Object.freeze({
  classic: "Classic · black & white",
  "magical-girl": "Magical Girl · rose & starlight",
  "spirit-warrior": "Spirit Warrior · ember & gold",
  ninja: "Ninja · midnight & crimson",
  "mech-pilot": "Mech Pilot · steel & cyan",
  elementalist: "Elementalist · jade & ocean",
});
export const APPEARANCE_DEFAULTS = Object.freeze({
  textColor: "#111111", borderColor: "#222222", pageColor: "#ffffff",
  panelColor: "#ffffff", headingColor: "#ffffff", headingFont: "clean",
  textSize: "standard", corners: "square", diceTheme: "classic", diceEffects: true, animateDice: true,
});
export const APPEARANCE_OPTIONS = Object.freeze({
  headingFont: Object.fromEntries(Object.entries(HEADING_FONTS).map(([key, font]) => [key, font.label])),
  textSize: { compact: "Compact", standard: "Standard", large: "Large" },
  corners: { square: "Square", soft: "Soft", rounded: "Rounded" },
  diceTheme: DICE_THEMES,
});
export const APPEARANCE_LABELS = Object.freeze({ textColor: "Text color", borderColor: "Border color", pageColor: "Page color",
  panelColor: "Panel color", headingColor: "Heading background", headingFont: "Heading font", textSize: "Text size", corners: "Corners",
  diceTheme: "Dice style", diceEffects: "Particle effects", animateDice: "Animate dice" });
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
export function isAppearanceValue(key, value) {
  if (!own(APPEARANCE_DEFAULTS, key)) return false;
  if (key.endsWith("Color")) return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  if (typeof APPEARANCE_DEFAULTS[key] === "boolean") return typeof value === "boolean";
  return typeof value === "string" && own(APPEARANCE_OPTIONS[key], value);
}
export function normalizeAppearance(source) {
  return Object.fromEntries(Object.entries(APPEARANCE_DEFAULTS).map(([key, fallback]) => {
    const value = source && own(source, key) ? source[key] : undefined;
    return [key, isAppearanceValue(key, value) ? key.endsWith("Color") ? value.toLowerCase() : value : fallback];
  }));
}
export function buildAppearancePatch(changes) {
  const patch = {};
  for (const [key, value] of Object.entries(changes || {})) {
    if (!isAppearanceValue(key, value)) throw new TypeError(`Invalid sheet appearance setting: ${key}`);
    patch[`builder.sheet.appearance.${key}`] = key.endsWith("Color") ? value.toLowerCase() : value;
  }
  return patch;
}
export function appearanceVariables(input) {
  const p = normalizeAppearance(input);
  return {
    "--primary-color": p.borderColor, "--input-border-color": p.borderColor, "--accent-color": p.borderColor,
    "--secondary-color": p.pageColor, "--panel-bg-color": p.panelColor, "--paper-color": p.panelColor,
    "--body-text-color": p.textColor, "--panel-text-color": p.textColor, "--header-text-color": p.textColor,
    "--header-bg-color": p.headingColor, "--table-header-bg-color": p.headingColor, "--chip-bg-color": p.headingColor,
    "--title-font": HEADING_FONTS[p.headingFont].css, "--sheet-text-size": { compact: "14px", standard: "16px", large: "18px" }[p.textSize],
    "--sheet-radius": { square: "0px", soft: "6px", rounded: "14px" }[p.corners],
  };
}
function luminance(hex) {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
}
export function appearanceContrastWarning(input) {
  const p = normalizeAppearance(input), text = luminance(p.textColor);
  const low = [p.panelColor, p.headingColor].some(color => {
    const background = luminance(color);
    return (Math.max(text, background) + .05) / (Math.min(text, background) + .05) < 4.5;
  });
  return low ? "These colors may be difficult to read. Try darker text or a lighter background, or reset the appearance." : "";
}

/** Track only edited leaves, so unrelated preferences survive concurrent saves. */
export function createAppearanceEditor(onChange = () => {}) {
  let values = normalizeAppearance(), pending = {};
  return {
    load(source) { values = normalizeAppearance(source); pending = {}; return { ...values }; },
    get() { return { ...values }; },
    change(key, value) {
      if (!isAppearanceValue(key, value)) return false;
      const normalized = normalizeAppearance({ [key]: value })[key];
      if (values[key] === normalized) return true;
      values[key] = normalized; pending[key] = normalized; onChange({ ...values }); return true;
    },
    reset() {
      for (const [key, value] of Object.entries(APPEARANCE_DEFAULTS)) if (values[key] !== value) pending[key] = value;
      values = normalizeAppearance(); onChange({ ...values });
    },
    patch() { return buildAppearancePatch(pending); },
    acknowledge(patch) {
      for (const [key, value] of Object.entries(pending)) if (patch[`builder.sheet.appearance.${key}`] === value) delete pending[key];
    },
  };
}
