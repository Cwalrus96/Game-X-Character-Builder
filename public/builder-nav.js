// public/builder-nav.js
import { getEnabledSteps, getPrevNext } from "./builder-flow.js";
import { buildBuilderUrl } from "./builder-common.js";

/**
 * Render a step list (orientation) and prev/next controls.
 *
 * Design:
 * - Step list shows all enabled steps.
 * - A step is clickable only if it has been visited before.
 * - The current step is marked with aria-current="step". (MDN) 
 *
 * @param {{
 *   mountEl: HTMLElement,
 *   currentStepId: string,
 *   characterDoc: any,
 *   ctx: { charId: string, requestedUid?: string|null },
 *   onBeforeNext?: (nextStep: any) => Promise<boolean> | boolean,
 * }} args
 */
export function renderBuilderNav(args) {
  const { mountEl, currentStepId, characterDoc, ctx, onBeforeNext } = args;
  if (!mountEl) return;

  const steps = getEnabledSteps(characterDoc);
  const { prev, next } = getPrevNext(currentStepId, characterDoc);

  const visited = new Set(characterDoc?.builder?.visitedSteps || []);
  visited.add(currentStepId);

  // Clear mount
  mountEl.innerHTML = "";

  const nav = document.createElement("nav");
  nav.className = "builderNav";
  nav.setAttribute("aria-label", "Character builder steps");

  // ---- Step list (orientation) ----
  const ol = document.createElement("ol");
  ol.className = "builderStepList";

  steps.forEach((step, idx) => {
    const li = document.createElement("li");
    li.className = "builderStep";

    const isCurrent = step.id === currentStepId;
    const isVisited = visited.has(step.id);
    const labelText = step.title || step.id;

    // Visually show step number (simple orientation)
    const number = document.createElement("span");
    number.className = "builderStepNum";
    number.textContent = String(idx + 1);

    const label = document.createElement("span");
    label.className = "builderStepLabel";

    if (isCurrent) {
      li.classList.add("current");
      li.setAttribute("aria-current", "step");
      label.textContent = labelText;

      const sr = document.createElement("span");
      sr.className = "srOnly";
      sr.textContent = " (current)";
      label.append(sr);
    } else if (isVisited) {
      li.classList.add("visited");
      const a = document.createElement("a");
      a.href = buildBuilderUrl(step.path, ctx);
      a.textContent = labelText;

      const sr = document.createElement("span");
      sr.className = "srOnly";
      sr.textContent = " (visited)";
      a.append(sr);

      label.append(a);
    } else {
      li.classList.add("locked");
      const span = document.createElement("span");
      span.textContent = labelText;
      span.setAttribute("aria-disabled", "true");
      label.append(span);
    }

    li.append(number, label);
    ol.append(li);
  });

  // ---- Prev/Next controls ----
  const controls = document.createElement("div");
  controls.className = "builderNavControls";

  if (prev) {
    const prevLink = document.createElement("a");
    prevLink.className = "btn secondary";
    prevLink.href = buildBuilderUrl(prev.path, ctx);
    prevLink.textContent = "Previous";
    controls.append(prevLink);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "builderNavSpacer";
    controls.append(spacer);
  }

  if (next) {
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn";
    nextBtn.type = "button";
    nextBtn.textContent = "Next";

    nextBtn.addEventListener("click", async () => {
      nextBtn.disabled = true;
      try {
        if (typeof onBeforeNext === "function") {
          const ok = await onBeforeNext(next);
          if (!ok) return;
        }
        window.location.href = buildBuilderUrl(next.path, ctx);
      } finally {
        nextBtn.disabled = false;
      }
    });

    controls.append(nextBtn);
  }

  nav.append(ol, controls);
  mountEl.append(nav);
}
