import { ATTR_KEYS, labelForAttrKey } from "../../core/character-rules.js";
import { escapeHtml } from "../../core/data-sanitization.js";
import { buildDicePool, resolveDicePool, resolveRollOutcome, buildDamageBands } from "../../core/roll-rules.js";
import { calculateAttackDamage, parseDamageFormula, getDamagePumping } from "../../core/damage-rules.js";
import { getRollSkills, getRollAttribute, getTechniqueRollChoices } from "../../core/sheet-roll-context.js?v=sheet-rolls2";
import { randomDieFace } from "../../core/dice-random.js";
import { restoreDialogFocus } from "../../core/dialog-lifecycle.js";
import { renderDiceResults } from "./components/dice-view.js";

const esc = value => escapeHtml(String(value ?? ""));
const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
const numberField = (id, label, value = 0, help = "") => `<label class="roll-field" for="${id}">${label}<input id="${id}" type="text" autocomplete="off" value="${value}"/>${help ? `<small>${help}</small>` : ""}</label>`;

export function createRollDialog({ nextFace = randomDieFace } = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "roll-dialog";
  dialog.setAttribute("aria-labelledby", "roll-title");
  // Intentionally no named inputs: sheet persistence must never collect these.
  dialog.innerHTML = `
    <header class="roll-header"><h2 id="roll-title">Roll</h2><button type="button" class="roll-close" data-roll-close aria-label="Close dice roller">×</button></header>
    <div class="roll-body">
      <div id="roll-diagnostics" class="roll-notice" hidden></div>
      <div id="roll-setup">
        <p id="roll-source" class="roll-help"></p>
        <label class="roll-field" id="roll-attack-field" for="roll-attack">Attack / weapon<select id="roll-attack"></select></label>
        <div class="roll-grid" id="roll-check-fields">
          <label class="roll-field" for="roll-skill">Skill<select id="roll-skill"></select></label>
          <label class="roll-field" for="roll-attribute">Attribute<select id="roll-attribute"></select></label>
        </div>
        <p id="roll-attribute-note" class="roll-help"></p>
        <p id="roll-defense" class="roll-help" hidden></p>
        <div class="roll-grid" id="roll-energy-fields">
          ${numberField("roll-energy", "Energy spent (X)", 0, "For formulas that explicitly include X.")}
          ${numberField("roll-pumping", "Additional pumping Energy", 0)}
        </div>
        <details id="roll-modifiers"><summary>Modifiers and damage adjustments</summary>
          <p class="roll-help">Enter the net bonus or penalty once per type. Same-type bonuses do not stack. Half dice use .5. Include situational effects that apply to this action.</p>
          <div class="roll-grid">
            ${numberField("roll-circumstance", "Circumstance dice")}
            ${numberField("roll-equipment", "Equipment dice")}
            ${numberField("roll-status", "Status dice")}
            ${numberField("roll-other", "Other dice", 0, "For example, a repeated-skill penalty.")}
          </div>
          <div class="roll-grid" id="roll-damage-adjustments">
            ${numberField("roll-extra-damage", "Extra damage", 0, "Conditional weapon, Enhancement or other bonuses.")}
            ${numberField("roll-hits-multiplier", "Damage Hits multiplier", 1)}
            <label class="roll-field" for="roll-critical-mode">Critical damage<select id="roll-critical-mode"><option value="multiply">Multiply normally</option><option value="normal">Normal damage + alternative effect</option></select></label>
          </div>
        </details>
        <p class="roll-pool" id="roll-pool"></p>
        <p class="roll-error" id="roll-error" role="alert" hidden></p>
        <button class="roll-primary" type="button" id="roll-submit">Roll</button>
      </div>
      <section id="roll-result" aria-label="Roll result" hidden>
        <p id="roll-result-context" class="roll-help"></p>
        <p id="roll-total" class="roll-total" role="status" aria-live="polite" tabindex="-1"></p>
        <div id="roll-faces" class="roll-faces" aria-label="Individual dice results"></div>
        <label class="roll-field roll-tn" for="roll-tn">TN <span class="roll-help">(optional)</span><input id="roll-tn" type="text" inputmode="numeric" autocomplete="off" placeholder="—" title="Changing TN uses these same dice and Hits."/></label>
        <p id="roll-outcome" role="status" aria-live="polite"></p>
        <div id="roll-damage"></div>
        <div class="roll-result-actions"><button type="button" class="sheet-roll-button" id="roll-again">Roll again</button><label class="roll-motion"><input type="checkbox" id="roll-animate"/> Animate dice</label></div>
      </section>
      <details id="roll-rules" hidden><summary>Technique rules and effects</summary><div id="roll-rules-content"></div></details>
      <details id="roll-history" hidden><summary>Recent rolls · this sheet session</summary><div id="roll-history-list"></div></details>
    </div>`;
  document.body.append(dialog);
  const el = id => dialog.querySelector(`#${id}`);
  let request, choices = [], choice = null, skills = [], opener, current = null, nextId = 0;
  const history = [];
  const motionPreference = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let animationsEnabled = true;
  function syncMotionPreference() {
    el("roll-animate").checked = animationsEnabled && !motionPreference?.matches;
    el("roll-animate").disabled = Boolean(motionPreference?.matches);
    el("roll-animate").title = motionPreference?.matches ? "Animations are off because your device prefers reduced motion." : "Animate new rolls.";
    if (!el("roll-animate").checked) el("roll-faces").querySelector(".dice-animate")?.classList.remove("dice-animate");
  }
  syncMotionPreference();
  motionPreference?.addEventListener("change", syncMotionPreference);
  el("roll-animate").addEventListener("change", () => {
    animationsEnabled = el("roll-animate").checked;
    syncMotionPreference();
  });

  function readNumber(id, { half = false, blank = 0 } = {}) {
    const raw = el(id).value.trim();
    if (!raw) return blank;
    if (!(half ? /^[+-]?\d+(?:\.[05])?$/ : /^[+-]?\d+$/).test(raw)) throw new Error(`${el(id).closest("label").childNodes[0].textContent.trim()} must be ${half ? "a whole or half" : "a whole"} number.`);
    return Number(raw);
  }

  function selectedSkill() { return el("roll-skill").value === "" ? null : skills[Number(el("roll-skill").value)] || null; }
  function showError(message = "") { el("roll-error").textContent = message; el("roll-error").hidden = !message; }

  function configuration() {
    if (!choice) throw new Error("Choose an available attack.");
    const skill = selectedSkill();
    const attributeKey = el("roll-attribute").value;
    if (!choice.noRoll && (!skill || !ATTR_KEYS.includes(attributeKey))) throw new Error("Choose an Attribute and Skill before rolling.");
    const rank = skill?.rank ?? 0;
    const attribute = choice.noRoll ? 0 : Number(request.builder.attributes?.[attributeKey] ?? 0);
    const modifiers = ["roll-circumstance", "roll-equipment", "roll-status", "roll-other"].map(id => readNumber(id, { half: true }));
    modifiers.push(choice.adjustments?.dice || 0);
    const pool = buildDicePool({ attribute, skillRank: choice.noRoll ? 0 : rank, modifiers: choice.noRoll ? [] : modifiers });
    const damageArgs = { profile: choice.profile, skillRank: rank, weaponRank: choice.weapon?.rank ?? null,
      energy: el("roll-energy").disabled ? 0 : readNumber("roll-energy"),
      pumpingEnergy: el("roll-pumping").disabled ? 0 : readNumber("roll-pumping"),
      extraDamage: readNumber("roll-extra-damage"), hitsMultiplier: readNumber("roll-hits-multiplier") };
    const damage = calculateAttackDamage({ ...damageArgs, hits: 0 });
    return { title: request.technique?.techniqueName || `${labelForAttrKey(attributeKey)} (${skill?.name || "Skill"})`,
      source: choice.label, attributeKey, skill: skill ? { name: skill.name, rank } : null, pool, damageArgs,
      noRoll: choice.noRoll, profiles: choice.profiles, normalCritical: el("roll-critical-mode").value === "normal", damagePreview: damage };
  }

  function poolText(pool) {
    return `${pool.dice}d6${pool.coin ? " + coin" : ""}${pool.automaticHits ? ` + ${pool.automaticHits} automatic Hits` : ""}`;
  }

  function preview() {
    try {
      const config = configuration();
      const pool = config.pool;
      el("roll-pool").textContent = config.noRoll ? "This technique has no independent roll."
        : pool.reason || `${labelForAttrKey(config.attributeKey)} ${pool.attribute} + ${config.skill.name} ${pool.skillRank}${pool.adjustment ? ` ${pool.adjustment >= 0 ? "+" : "−"} ${Math.abs(pool.adjustment)} modifier dice` : ""} → ${poolText(pool)}`;
      el("roll-submit").disabled = false;
      showError();
    } catch (error) {
      el("roll-pool").textContent = "";
      el("roll-submit").disabled = true;
      showError(el("roll-skill").value && el("roll-attribute").value ? error.message : "");
    }
  }

  function updateSkill() {
    const skill = selectedSkill();
    const attribute = getRollAttribute(choice.profile, skill, request.builder, request.gameData);
    const allowed = attribute.fixed ? [attribute.key] : skill?.attributes || ATTR_KEYS;
    const preferred = el("roll-attribute").value || request.attributeKey;
    el("roll-attribute").innerHTML = option("", "Choose an attribute") + allowed.map(key => option(key, `${labelForAttrKey(key)} · ${request.builder.attributes?.[key] ?? 0}`)).join("");
    el("roll-attribute").value = !attribute.fixed && allowed.includes(preferred) ? preferred : attribute.key;
    el("roll-attribute").disabled = attribute.fixed;
    el("roll-attribute-note").textContent = choice.noRoll ? "" : [request.technique && choice.manualSkill ? "Choose the skill to use with this technique." : "", el("roll-attribute").value ? "" : attribute.note].filter(Boolean).join(" ");
    const rank = choice.weapon?.rank ?? skill?.rank ?? 0;
    const pumping = getDamagePumping(choice.profile, rank);
    const formula = parseDamageFormula(choice.profile?.damageByRank?.[rank] ?? choice.profile?.damage);
    el("roll-energy").disabled = !formula.energyVariable;
    el("roll-energy").closest("label").hidden = !formula.energyVariable;
    el("roll-pumping").disabled = pumping.perEnergy <= 0;
    el("roll-pumping").closest("label").hidden = pumping.perEnergy <= 0;
    el("roll-energy-fields").hidden = !formula.energyVariable && pumping.perEnergy <= 0;
    preview();
  }

  function renderRules(profiles) {
    el("roll-rules").hidden = !profiles?.length;
    el("roll-rules-content").innerHTML = (profiles || []).map(profile => `<article><h4>${esc(profile.techniqueName)}</h4>
      ${[profile.description, profile.damage ? `Damage: ${profile.damage}` : "", profile.rankNotes,
        profile.range ? `Range: ${profile.range}` : "", profile.targets ? `Targets: ${profile.targets}` : "",
        profile.energyCost != null ? `Base Energy: ${profile.energyCost}` : "",
        profile.strainCost ? `Strain: ${profile.strainCost}` : ""].filter(Boolean).map(text => `<p>${esc(text)}</p>`).join("")}
      ${["onCriticalFailure", "onFailure", "onSuccess", "onCriticalSuccess"].filter(key => profile[key]).map(key => `<p><strong>${{onCriticalFailure:"Critical failure",onFailure:"Failure",onSuccess:"Success",onCriticalSuccess:"Critical success"}[key]}:</strong> ${esc(profile[key])}</p>`).join("")}
      ${profile.pumpingByRank ? `<p><strong>Pumping:</strong> ${Object.entries(profile.pumpingByRank).map(([rank, effect]) => `Rank ${esc(rank)}: ${esc(effect)}`).join("; ")}</p>` : ""}</article>`).join("");
  }

  function updateChoice() {
    choice = choices[Number(el("roll-attack").value)] || null;
    if (!choice) return;
    skills = choice.skills;
    el("roll-source").textContent = request.technique?.techniqueName || "Choose an Attribute and Skill.";
    el("roll-skill").innerHTML = (choice.manualSkill && !choice.noRoll ? option("", "Choose a skill") : "") + skills.map((skill, i) => option(i, `${skill.name} · Rank ${skill.rank}${skill.sourceLabel ? ` · ${skill.sourceLabel}` : ""}`)).join("");
    if (request.skillKey) {
      const index = skills.findIndex(skill => skill.key === request.skillKey);
      if (index >= 0) el("roll-skill").value = String(index);
    }
    el("roll-attribute").value = "";
    el("roll-check-fields").hidden = choice.noRoll;
    el("roll-damage-adjustments").hidden = !choice.profile?.damage && !choice.profile?.damageByRank;
    el("roll-hits-multiplier").value = String(choice.adjustments?.hitsMultiplier || 1);
    el("roll-defense").hidden = !choice.profile.defense;
    el("roll-defense").textContent = choice.profile.defense ? `Against ${choice.profile.defense.replace(/ Defense$/i, "")} Defense · TN can be entered after rolling.` : "";
    el("roll-submit").textContent = choice.noRoll ? "Calculate" : "Roll";
    el("roll-energy").value = "0";
    el("roll-pumping").value = "0";
    renderRules(choice.profiles);
    updateSkill();
  }

  function effects(key) {
    const field = { criticalFailure: "onCriticalFailure", failure: "onFailure", success: "onSuccess", criticalSuccess: "onCriticalSuccess" }[key];
    return current.config.profiles?.filter(profile => profile[field]).map(profile => `${profile.techniqueName}: ${profile[field]}`).join("\n") || "";
  }

  function renderOutcome() {
    if (!current) return;
    try {
      const tn = readNumber("roll-tn", { blank: null });
      const outcome = current.config.noRoll ? null : resolveRollOutcome(current.roll.hits, tn);
      el("roll-tn").setAttribute("aria-invalid", "false");
      current.tn = tn;
      el("roll-outcome").textContent = outcome
        ? `${outcome.label} against TN ${tn} · margin ${outcome.margin >= 0 ? "+" : ""}${outcome.margin}`
        : current.config.noRoll ? "No target number is needed." : "";
      el("roll-outcome").hidden = !outcome && !current.config.noRoll;
      const damage = current.damage;
      if (!damage.ok) {
        el("roll-damage").innerHTML = damage.missing
          ? (current.config.profiles?.length ? `<p class="roll-help">See technique rules for effects.</p>` : "")
          : `<p class="roll-notice">${esc(damage.error)} ${esc(damage.text)}</p>`;
        return;
      }
      const breakdown = damage.parts.map(part => `${esc(part.label)} ${part.value}`).join(" + ");
      let html = `<p class="roll-damage-summary"><strong>Full damage: ${damage.total}</strong><span class="roll-help">Before armor / resistance</span></p>`;
      if (!current.config.noRoll) {
        const bands = buildDamageBands(damage.total, current.roll.hits, { normalCritical: current.config.normalCritical });
        html += `<div class="roll-table-wrap"><table class="roll-damage-table"><thead><tr><th scope="col">Outcome</th><th scope="col">Margin</th><th scope="col">Damage</th></tr></thead><tbody>${bands.map(band => {
          const active = outcome?.key === band.key && (band.key !== "criticalSuccess" || outcome.criticals === band.tier);
          return `<tr ${active ? 'class="roll-selected" aria-current="true"' : ""}><th scope="row">${active ? "✓ " : ""}${band.label}</th><td>${band.margin}</td><td><strong>${band.damage}</strong></td></tr>`;
        }).join("")}</tbody></table></div>`;
        const effectBands = bands.filter((band, i) => bands.findIndex(other => other.key === band.key) === i && effects(band.key));
        if (effectBands.length) html += `<details><summary>Outcome effects</summary>${effectBands.map(band => `<p class="roll-band-effects"><strong>${esc(band.key === "criticalSuccess" ? "Critical success" : band.label)}:</strong> ${esc(effects(band.key))}</p>`).join("")}</details>`;
      }
      html += `<details><summary>Damage calculation</summary><p class="roll-help">${breakdown} = ${damage.total}</p></details>`;
      el("roll-damage").innerHTML = html;
    } catch (error) {
      el("roll-tn").setAttribute("aria-invalid", "true");
      el("roll-outcome").hidden = false;
      el("roll-outcome").textContent = error.message;
      el("roll-damage").querySelectorAll(".roll-selected").forEach(row => { row.classList.remove("roll-selected"); row.removeAttribute("aria-current"); });
    }
  }

  function showResult(result, { animate = false } = {}) {
    current = result;
    dialog.classList.add("has-result");
    el("roll-setup").hidden = true;
    el("roll-diagnostics").hidden = true;
    el("roll-result").hidden = false;
    el("roll-result").setAttribute("aria-label", "Roll result");
    el("roll-title").textContent = "Roll result";
    const title = result.config.source?.startsWith(result.config.title) ? result.config.source : [result.config.title, result.config.source].filter(Boolean).join(" · ");
    el("roll-result-context").textContent = `${title}${result.config.skill && !result.config.noRoll ? ` · ${labelForAttrKey(result.config.attributeKey)} ${result.roll.pool.attribute} + ${result.config.skill.name} ${result.config.skill.rank} · ${poolText(result.roll.pool)}` : ""}`;
    el("roll-total").textContent = result.config.noRoll ? "No roll required" : `${result.roll.hits} Hits`;
    el("roll-faces").innerHTML = renderDiceResults(result.roll, {
      animate: animate && el("roll-animate").checked && !motionPreference?.matches, noRoll: result.config.noRoll,
    });
    el("roll-tn").value = result.tn ?? "";
    el("roll-tn").closest("label").hidden = result.config.noRoll;
    renderRules(result.config.profiles);
    renderOutcome();
  }

  function roll(event = {}, savedConfig = null) {
    if (event.detail > 1) return;
    try {
      const config = savedConfig || configuration();
      const result = resolveDicePool(config.pool, nextFace);
      const damage = calculateAttackDamage({ ...config.damageArgs, hits: result.hits });
      const record = { id: ++nextId, config: structuredClone(config), roll: result, damage, tn: null };
      history.unshift(record);
      history.splice(10);
      showError();
      showResult(record, { animate: true });
      el("roll-history").hidden = false;
      el("roll-history-list").innerHTML = history.map(item => `<button class="roll-history-item" type="button" data-roll-history="${item.id}">${esc(item.config.title)} · ${item.config.noRoll ? "No roll" : `${item.roll.hits} Hits`}</button>`).join("");
      el("roll-total").focus({ preventScroll: true });
      dialog.scrollTop = 0;
    } catch (error) { showError(error.message); }
  }

  el("roll-submit").addEventListener("click", roll);
  el("roll-again").addEventListener("click", event => roll(event, current?.config));
  el("roll-attack").addEventListener("change", updateChoice);
  el("roll-skill").addEventListener("change", updateSkill);
  el("roll-setup").addEventListener("input", preview);
  el("roll-setup").addEventListener("change", preview);
  el("roll-tn").addEventListener("input", renderOutcome);
  el("roll-tn").addEventListener("change", renderOutcome);
  el("roll-history-list").addEventListener("click", event => {
    const button = event.target.closest("[data-roll-history]");
    if (button) showResult(history.find(item => item.id === Number(button.dataset.rollHistory)));
  });
  dialog.querySelector("[data-roll-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); dialog.close(); } });
  dialog.addEventListener("close", () => restoreDialogFocus(opener));

  return {
    close() { if (dialog.open) dialog.close(); },
    open(nextRequest, nextOpener) {
      request = nextRequest;
      opener = nextOpener;
      current = null;
      dialog.classList.remove("has-result");
      el("roll-result").hidden = true;
      for (const id of ["roll-circumstance", "roll-equipment", "roll-status", "roll-other", "roll-extra-damage"]) el(id).value = "0";
      el("roll-critical-mode").value = "multiply";
      el("roll-modifiers").open = Boolean(request.modifiers);
      el("roll-rules").open = false;
      el("roll-title").textContent = "Roll";
      const resolved = request.technique ? getTechniqueRollChoices(request) : { choices: [{ profile: {}, profiles: [], label: "", skills: getRollSkills(request.gameData, request.builder), manualSkill: true, noRoll: false, adjustments: {} }], diagnostics: [] };
      choices = resolved.choices;
      el("roll-setup").hidden = !choices.length;
      el("roll-diagnostics").hidden = !resolved.diagnostics.length;
      el("roll-diagnostics").textContent = resolved.diagnostics.join(" ");
      el("roll-attack").innerHTML = choices.map((item, i) => option(i, item.label)).join("");
      el("roll-attack-field").hidden = choices.length <= 1;
      if (choices.length) updateChoice();
      else renderRules(request.technique ? [request.technique] : []);
      if (!dialog.open) dialog.show();
      dialog.scrollTop = 0;
      if (request.quick && choices.length && !el("roll-submit").disabled) roll();
      else if (choices.length) {
        (request.attributeKey ? el("roll-skill") : !el("roll-attribute").value ? el("roll-attribute") : el("roll-submit")).focus({ preventScroll: true });
      }
    },
  };
}
