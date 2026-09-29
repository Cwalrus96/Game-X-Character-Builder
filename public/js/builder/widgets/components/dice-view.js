import { escapeHtml } from "../../../core/data-sanitization.js";
import { normalizeAppearance } from "../../../core/sheet-appearance.js";

// Geometry only. Faces, Hits and the coin outcome are supplied by Roll Rules.
export const D6_FACES = Object.freeze([
  { face: 1, x: 0, y: 0, pips: [5] },
  { face: 2, x: 0, y: 90, pips: [1, 9] },
  { face: 3, x: 90, y: 0, pips: [1, 5, 9] },
  { face: 4, x: -90, y: 0, pips: [1, 3, 7, 9] },
  { face: 5, x: 0, y: -90, pips: [1, 3, 5, 7, 9] },
  { face: 6, x: 0, y: 180, pips: [1, 3, 4, 6, 7, 9] },
].map(face => Object.freeze({ ...face, pips: Object.freeze(face.pips) })));

export function getDieLanding(face) {
  const side = D6_FACES.find(side => side.face === face);
  if (!side) throw new RangeError("A d6 must land on a face from 1 to 6.");
  return { x: -side.x, y: -side.y };
}

const hitsText = hits => `${hits} ${hits === 1 ? "Hit" : "Hits"}`;
const faceHtml = D6_FACES.map(side => `<span class="dice-face" data-face="${side.face}" style="transform:rotateX(${side.x}deg) rotateY(${side.y}deg) translateZ(var(--dice-half))">${side.pips.map(pip => `<i class="dice-pip dice-pip-${pip}"></i>`).join("")}</span>`).join("");

function token({ label, hits, pose, content, coin = false, index }) {
  // Deterministic variation decorates the existing result; it consumes no RNG.
  return `<div class="dice-token${coin ? " dice-token-coin" : ""}" role="img" aria-label="${label}" style="--land-x:${pose.x}deg;--land-y:${pose.y}deg;--launch-x:${index % 2 ? 20 : -20}px;--launch-z:${(index % 3 - 1) * 50}deg;--dice-delay:${index * 22}ms">
    <span class="dice-shadow" aria-hidden="true"></span>
    <span class="dice-flight" aria-hidden="true"><span class="dice-angle"><span class="${coin ? "dice-coin" : "dice-cube"}">${content}</span></span></span>
    <span class="dice-hits" aria-hidden="true">${coin ? "½ · " : ""}${hitsText(hits)}</span>
  </div>`;
}

/** Replaying history/TN changes never animate or resolve a new result. */
export function renderDiceResults(roll, { animate = false, noRoll = false, theme = "classic", effects = true } = {}) {
  if (noRoll) return "";
  const tokens = roll.dice.map((die, index) => token({ label: `Die ${die.face}: ${hitsText(die.hits)}`,
    hits: die.hits, pose: getDieLanding(die.face), content: faceHtml, index }));
  if (roll.coin !== null) {
    if (![0, 1].includes(roll.coin)) throw new RangeError("A half-die coin must show 0 or 1 Hit.");
    tokens.push(token({ coin: true, index: tokens.length, hits: roll.coin,
      label: `Half-die coin: ${hitsText(roll.coin)}`, pose: { x: 0, y: roll.coin ? 0 : 180 },
      content: '<span class="dice-coin-rim"></span><span class="dice-coin-side dice-coin-heads">1</span><span class="dice-coin-side dice-coin-tails">0</span>' }));
  }
  const safeTheme = normalizeAppearance({ diceTheme: theme }).diceTheme;
  const particles = animate && effects && safeTheme === "magical-girl" ? `<span class="dice-particles" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--spark-x:${4 + i * 5.3}%;--spark-y:${18 + i % 4 * 19}%;--spark-drift:${(i % 5 - 2) * 14}px;--spark-delay:${120 + i % 6 * 60}ms">${i % 4 === 0 ? "♥" : "✦"}</i>`).join("")}</span>` : "";
  return (tokens.length ? `<div class="dice-tray${animate ? " dice-animate" : ""}" data-dice-theme="${safeTheme}" style="--dice-columns:${Math.min(6, tokens.length)}">${tokens.join("")}${particles}</div>` : "")
    + (roll.pool.automaticHits ? `<p class="roll-automatic">+${roll.pool.automaticHits} automatic Hits</p>` : "")
    + (roll.pool.reason ? `<p class="roll-help">${escapeHtml(roll.pool.reason)}</p>` : "");
}
