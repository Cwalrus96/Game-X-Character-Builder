import assert from "node:assert/strict";
import test from "node:test";
import { createSheetHpControl, parseHpInput } from "../public/js/pages/sheet-hp-control.js";
import { buildTemporarySheetUpdatePatch } from "../public/js/core/sheet-state.js";

class Input extends EventTarget {
  value = "40";
  disabled = false;
  readOnly = false;
  attributes = {};
  setCustomValidity(message) { this.validationMessage = message; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function fixture() {
  const input = new Input();
  const error = { textContent: "", hidden: true };
  const commits = [];
  const control = createSheetHpControl({ input, error, onCommit: () => commits.push(control.getValue()) });
  const type = (value) => {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  };
  const key = (key, isComposing = false) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, isComposing });
    input.dispatchEvent(event);
  };
  const change = () => input.dispatchEvent(new Event("change"));
  return { input, error, control, commits, type, key, change };
}

test("HP accepts exact direct values and signed adjustments, preserving zero and allowing above max character HP", () => {
  for (const [raw, current, expected] of [
    ["40", "17", "40"], ["+16", "40", "56"], ["-21", "56", "35"],
    ["0", "35", "0"], ["+16", "0", "16"], ["-21", "10", "0"],
    [" +016 ", "40", "56"], ["00042", "", "42"], ["999999", "", "999999"],
    ["+0", "0", "0"], ["-0", "35", "35"],
  ]) assert.deepEqual(parseHpInput(raw, current), { ok: true, value: expected }, raw);
});

test("HP rejects incomplete, fractional, scientific, malformed and oversized inputs", () => {
  for (const raw of ["", " ", "+", "-", "--21", "+-16", "1.5", "1e2", "0x10", "12hp", "+ 16", "1,000", "NaN", "Infinity", "1000000", "+99999999999999999999", "-99999999999999999999"]) {
    assert.equal(parseHpInput(raw, "40").ok, false, raw);
  }
  assert.equal(parseHpInput("+1", "999999").ok, false);
  for (const current of ["", undefined, "bad", "-4", "1.5", "1000000"]) {
    assert.equal(parseHpInput("+16", current).ok, false);
  }
});

test("typing a delta never changes the accepted HP or another field's save snapshot", () => {
  const f = fixture();
  for (const raw of ["+", "+1", "+16", "bad", ""]) {
    f.type(raw);
    const patch = buildTemporarySheetUpdatePatch({ allFields: { hpcur: f.control.getValue(), notes: "Other edit" } });
    assert.equal(patch["builder.sheet.fields.hpcur"], "40");
  }
  assert.deepEqual(f.commits, []);
});

test("Enter applies a delta once even when followed by change or repeated Enter", () => {
  const f = fixture();
  f.type("+16");
  f.key("Enter");
  f.change();
  f.input.dispatchEvent(new Event("blur"));
  f.key("Enter");
  assert.equal(f.input.value, "56");
  assert.deepEqual(f.commits, ["56"]);
  f.type("-21");
  f.input.dispatchEvent(new Event("blur"));
  assert.equal(f.control.getValue(), "35");
  assert.deepEqual(f.commits, ["56", "35"]);
});

test("direct set commits on leaving the field; clearing or invalid edits preserve HP and report errors", () => {
  const f = fixture();
  f.type("72");
  f.change();
  for (const raw of ["", "12hp", "1e2", "1.5", "--2"]) {
    f.type(raw);
    f.change();
    assert.equal(f.control.getValue(), "72");
    assert.equal(f.error.hidden, false);
    assert.equal(f.input.attributes["aria-invalid"], "true");
  }
  assert.deepEqual(f.commits, ["72"]);
  f.type("+2");
  f.key("Enter");
  assert.equal(f.control.getValue(), "74");
  assert.equal(f.error.hidden, true);
  assert.equal(f.input.validationMessage, "");
});

test("Escape cancels an unfinished or invalid adjustment without saving", () => {
  const f = fixture();
  f.type("-");
  f.change();
  f.key("Escape");
  f.change();
  assert.equal(f.input.value, "40");
  assert.equal(f.error.hidden, true);
  assert.deepEqual(f.commits, []);
});

test("HP does not apply edits before loading or during IME composition", () => {
  const f = fixture();
  f.control.setEnabled(false);
  f.type("+16");
  f.key("Enter");
  f.change();
  assert.equal(f.control.getValue(), "40");
  f.control.setValue("80");
  f.control.setEnabled(true);
  f.type("+16");
  f.key("Enter", true);
  assert.equal(f.control.getValue(), "80");
  f.key("Enter");
  assert.equal(f.control.getValue(), "96");
  assert.deepEqual(f.commits, ["96"]);
});

test("loaded blank HP needs a direct value before adjustments; zero reloads as zero", () => {
  const f = fixture();
  f.control.setValue("");
  f.type("+16");
  f.change();
  assert.match(f.error.textContent, /Set current HP/);
  assert.equal(f.control.getValue(), "");
  f.type("0");
  f.change();
  f.control.setValue(f.control.getValue());
  assert.equal(f.input.value, "0");
  f.type("+16");
  f.change();
  assert.equal(f.control.getValue(), "16");
});
