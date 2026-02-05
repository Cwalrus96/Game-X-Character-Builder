// public/builder-flow.js
/**
 * Builder flow configuration.
 *
 * Authoring principle:
 * - Edit BUILDER_STEPS to add/remove/reorder steps.
 * - All relationships (prev/next) are derived at runtime.
 */

/**
 * @typedef {Object} BuilderStep
 * @property {string} id           Stable identifier (used for visited tracking).
 * @property {string} title        Human-readable title for the step list.
 * @property {string} path         HTML page path (relative to /public root).
 * @property {(characterDoc: any) => boolean} [isEnabled] Optional conditional inclusion.
 */

/** @type {BuilderStep[]} */
export const BUILDER_STEPS = [
  {
    // Historical note: this id used to represent "Level & Attributes".
    // We keep the stable id for compatibility with existing visitedSteps data.
    id: "basics",
    title: "Name + Profile",
    path: "builder.html",
  },
  {
    id: "class",
    title: "Class",
    path: "builder-class.html",
  },
  {
    id: "attributes",
    title: "Attributes",
    path: "builder-attributes.html",
  },

  // Add new steps here later, e.g.:
  // { id: "techniques", title: "Techniques", path: "builder-techniques.html" },
];

/**
 * Returns steps enabled for this character (supports future conditional steps).
 * @param {any} characterDoc
 * @returns {BuilderStep[]}
 */
export function getEnabledSteps(characterDoc) {
  return BUILDER_STEPS.filter((s) => (typeof s.isEnabled === "function" ? !!s.isEnabled(characterDoc) : true));
}

/**
 * @param {string} id
 * @returns {BuilderStep | null}
 */
export function getStepById(id) {
  return BUILDER_STEPS.find((s) => s.id === id) || null;
}

/**
 * @param {string} id
 * @param {any} characterDoc
 * @returns {{ prev: BuilderStep | null, next: BuilderStep | null, index: number }}
 */
export function getPrevNext(id, characterDoc) {
  const steps = getEnabledSteps(characterDoc);
  const index = steps.findIndex((s) => s.id === id);
  const prev = index > 0 ? steps[index - 1] : null;
  const next = index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;
  return { prev, next, index };
}
