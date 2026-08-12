import { escapeHtml } from "../../core/data-sanitization.js";
import { normalizeBoonGrant } from "../../core/boon-rules.js";
import { BuilderWidget } from "./builder-widget.js";

export class BoonWidget extends BuilderWidget {
  constructor(page, { grant, scope = "boons", documentRef = globalThis.document } = {}) {
    const boon = normalizeBoonGrant(grant);
    if (!boon) throw new TypeError("BoonWidget requires a valid Boon grant adapter record.");
    super(page, { id: `boon:${boon.boonKey}`, scope });
    this.boon = boon;
    this.documentRef = documentRef;
    this.element = this.render();
  }

  render() {
    const element = this.documentRef.createElement("article");
    element.className = "optionRow boonWidget";
    element.dataset.boonKey = this.boon.boonKey;
    element.innerHTML = `<div><div class="optionTitle">${escapeHtml(this.boon.name)}</div>${this.boon.description ? `<div class="optionDesc">${escapeHtml(this.boon.description)}</div>` : ""}</div>`;
    return element;
  }
}
