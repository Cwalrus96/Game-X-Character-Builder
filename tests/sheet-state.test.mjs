import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemporarySheetUpdatePatch,
  isSheetOwnedUpdatePath,
  pickTemporarySheetFields,
  pickTemporarySheetRepeatables,
} from "../public/js/core/sheet-state.js";

function applyDottedPatch(target, patch) {
  const result = structuredClone(target);
  for (const [dottedPath, value] of Object.entries(patch)) {
    const parts = dottedPath.split(".");
    let cursor = result;
    for (const part of parts.slice(0, -1)) {
      cursor[part] = cursor[part] && typeof cursor[part] === "object" ? cursor[part] : {};
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = structuredClone(value);
  }
  return result;
}

test("sheet autosave emits only exact sheet-owned leaf paths", () => {
  const patch = buildTemporarySheetUpdatePatch({
    allFields: {
      charName: "Stale Name",
      classSelect: "magical-guardian",
      primaryAttribute: "attunement",
      level: "12",
      brawn: "6",
      hpcur: "17",
      strain: "3",
      overstrained: true,
      notes: "Remember the moon gate.",
      rank_spellcasting: "5",
    },
    repeatables: {
      abilities: [{ name: "Stale ability", text: "Must not be written." }],
      combatSkillsExtra: [{ skill: "Martial Arts", rank: "4" }],
      settingSkills: [{ skill: "History", rank: "2" }],
      conditions: [{ name: "Burning", n: "2", notes: "Until end of turn" }],
    },
  });

  assert.deepEqual(patch, {
    "builder.sheet.fields.hpcur": "17",
    "builder.sheet.fields.strain": "3",
    "builder.sheet.fields.overstrained": true,
    "builder.sheet.fields.notes": "Remember the moon gate.",
    "builder.sheet.repeatables.conditions": [{
      name: "Burning",
      n: "2",
      notes: "Until end of turn",
    }],
  });
  assert(Object.keys(patch).every((path) => isSheetOwnedUpdatePath(path)));

  const forbiddenPaths = [
    "schemaVersion",
    "ownerUid",
    "builder.name",
    "builder.portraitPath",
    "builder.level",
    "builder.attributes",
    "builder.classKey",
    "builder.primaryAttribute",
    "builder.weapons",
    "builder.sheet.fields",
    "builder.sheet.fields.rank_spellcasting",
    "builder.sheet.repeatables",
    "builder.sheet.repeatables.abilities",
    "builder.sheet.repeatables.combatSkillsExtra",
    "builder.sheet.repeatables.settingSkills",
  ];
  for (const path of forbiddenPaths) assert.equal(path in patch, false);
});

test("temporary sheet state is sanitized and bounded independently", () => {
  assert.deepEqual(pickTemporarySheetFields({
    hpcur: "-4",
    strain: "8",
    overstrained: 1,
    notes: "  line one\nline two  ",
    classSelect: "must-not-survive",
  }), {
    hpcur: "0",
    strain: "8",
    overstrained: true,
    notes: "line one\nline two",
  });

  assert.deepEqual(pickTemporarySheetRepeatables({
    conditions: [
      { name: "  Stunned  ", n: "-2", notes: "  One round  " },
      { name: "", n: "", notes: "" },
    ],
    abilities: [{ name: "Must not survive" }],
  }), {
    conditions: [{
      name: "Stunned",
      n: "0",
      notes: "One round",
    }],
  });
});

test("sheet ownership rejects map-wide and builder-owned paths", () => {
  assert.equal(isSheetOwnedUpdatePath("builder.sheet.fields.hpcur"), true);
  assert.equal(isSheetOwnedUpdatePath("builder.sheet.repeatables.conditions"), true);
  assert.equal(isSheetOwnedUpdatePath("builder.sheet.fields"), false);
  assert.equal(isSheetOwnedUpdatePath("builder.sheet.repeatables"), false);
  assert.equal(isSheetOwnedUpdatePath("builder.sheet.fields.rank_spellcasting"), false);
  assert.equal(isSheetOwnedUpdatePath("builder.classKey"), false);
});

test("a stale sheet tab cannot overwrite newer builder-owned state", () => {
  const newerPersistedCharacter = {
    builder: {
      name: "New Builder Name",
      classKey: "magical-guardian",
      level: 8,
      primaryAttribute: "attunement",
      attributes: { strength: 1, attunement: 5 },
      weapons: [{ weaponKey: "moon-staff" }],
      sheet: {
        fields: { hpcur: "20", notes: "Before stale tab save" },
        repeatables: { conditions: [] },
      },
    },
  };
  const staleSheetPatch = buildTemporarySheetUpdatePatch({
    allFields: {
      charName: "Old Name",
      classSelect: "old-class",
      level: "2",
      primaryAttribute: "strength",
      hpcur: "14",
      notes: "Saved from the stale sheet tab",
    },
    repeatables: {
      abilities: [{ name: "Old ability" }],
      conditions: [{ name: "Slowed", n: "1", notes: "One round" }],
    },
  });

  const afterStaleSheetSave = applyDottedPatch(newerPersistedCharacter, staleSheetPatch);
  assert.deepEqual(afterStaleSheetSave.builder, {
    ...newerPersistedCharacter.builder,
    sheet: {
      fields: {
        hpcur: "14",
        notes: "Saved from the stale sheet tab",
      },
      repeatables: {
        conditions: [{ name: "Slowed", n: "1", notes: "One round" }],
      },
    },
  });
});
