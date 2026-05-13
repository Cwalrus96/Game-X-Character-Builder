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
 *   onBeforeNavigate?: (targetStep: any) => Promise<boolean> | boolean,
 *   allowAllSteps?: boolean,
 *   showControls?: boolean,
 *   leadingLink?: { href: string, label: string } | null,
 *   ariaLabel?: string,
 * }} args
 */
export function renderBuilderNav(args) {
  const {
    mountEl,
    currentStepId,
    characterDoc,
    ctx,
    onBeforeNavigate,
    allowAllSteps = false,
    showControls = true,
    leadingLink = null,
    ariaLabel = "Character builder steps",
  } = args;
  if (!mountEl) return;

  const steps = getEnabledSteps(characterDoc);
  const { prev, next } = getPrevNext(currentStepId, characterDoc);

  const visited = new Set(characterDoc?.builder?.visitedSteps || []);
  if (currentStepId) visited.add(currentStepId);

  // Clear mount
  mountEl.innerHTML = "";

  const nav = document.createElement("nav");
  nav.className = "builderNav";
  const showControlSlots = showControls || !!leadingLink;
  if (!showControlSlots) nav.classList.add("builderNav--stepsOnly");
  if (leadingLink && !showControls) nav.classList.add("builderNav--leadingOnly");
  nav.setAttribute("aria-label", ariaLabel);

  // ---- Step list (orientation) ----
  const ol = document.createElement("ol");
  ol.className = "builderStepList";

  /**
   * Navigate to a builder step path, optionally running a pre-nav hook.
   * @param {any} targetStep
   */
  async function goToStep(targetStep) {
    if (!targetStep) return;
    if (typeof onBeforeNavigate === "function") {
      const ok = await onBeforeNavigate(targetStep);
      if (!ok) return;
    }
    window.location.href = buildBuilderUrl(targetStep.path, ctx);
  }

  steps.forEach((step, idx) => {
    const li = document.createElement("li");
    li.className = "builderStep";

    const isCurrent = step.id === currentStepId;
    const isVisited = allowAllSteps || visited.has(step.id);
    const labelText = step.navTitle || step.title || step.id;

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

      a.addEventListener("click", (e) => {
        // Allow normal navigation if no hook is provided.
        if (typeof onBeforeNavigate !== "function") return;
        e.preventDefault();
        void goToStep(step);
      });

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

  if (showControlSlots) {
    // ---- Prev/Next controls ----
    const prevSlot = document.createElement("div");
    prevSlot.className = "builderNavControl builderNavControl--prev";

    const nextSlot = document.createElement("div");
    nextSlot.className = "builderNavControl builderNavControl--next";

    if (leadingLink) {
      const link = document.createElement("a");
      link.className = "btn secondary";
      link.href = leadingLink.href;
      link.textContent = leadingLink.label;

      link.addEventListener("click", (e) => {
        if (typeof onBeforeNavigate !== "function") return;
        e.preventDefault();
        void (async () => {
          const ok = await onBeforeNavigate({ path: leadingLink.href });
          if (ok) window.location.href = leadingLink.href;
        })();
      });
      prevSlot.append(link);
    } else if (prev) {
      const prevLink = document.createElement("a");
      prevLink.className = "btn secondary";
      prevLink.href = buildBuilderUrl(prev.path, ctx);
      prevLink.textContent = "Previous";

      prevLink.addEventListener("click", (e) => {
        if (typeof onBeforeNavigate !== "function") return;
        e.preventDefault();
        void goToStep(prev);
      });
      prevSlot.append(prevLink);
    }

    if (showControls && next) {
      const nextBtn = document.createElement("button");
      nextBtn.className = "btn";
      nextBtn.type = "button";
      nextBtn.textContent = "Next";

      nextBtn.addEventListener("click", async () => {
        nextBtn.disabled = true;
        try {
          await goToStep(next);
        } finally {
          nextBtn.disabled = false;
        }
      });

      nextSlot.append(nextBtn);
    }

    if (leadingLink && !showControls) {
      nav.append(prevSlot, ol);
    } else {
      nav.append(prevSlot, ol, nextSlot);
    }
  } else {
    nav.append(ol);
  }

  mountEl.append(nav);
}

/**
 * Find or create the standard builder nav mount point inside the shared app bar.
 * The builder has one navigation surface: the shared floating app bar.
 *
 * @returns {{ topEl: HTMLElement|null, bottomEl: HTMLElement|null }}
 */
export function ensureBuilderNavMounts() {
  const topbar = document.querySelector(".app-topbar") || document.querySelector(".topbar");
  let topEl = document.getElementById("appBuilderNavSlot");
  if (!topEl && topbar) {
    topEl = document.createElement("div");
    topEl.id = "appBuilderNavSlot";
    topEl.className = "app-builder-nav-slot";
    topbar.append(topEl);
  }

  return { topEl, bottomEl: null };
}

/**
 * Render the builder nav into the standard top and bottom mount points.
 *
 * @param {Omit<Parameters<typeof renderBuilderNav>[0], "mountEl">} args
 */
export function renderBuilderNavMounts(args) {
  const { topEl } = ensureBuilderNavMounts();
  if (topEl) renderBuilderNav({ ...args, mountEl: topEl });
  return { topEl, bottomEl: null };
}
