import assert from "node:assert/strict";
import test from "node:test";
import { OptionGroupWidget } from "../public/js/builder/widgets/option-group-widget.js";

test("a defined option blocked by an unready grant does not claim its mechanics are missing", () => {
  let prerequisiteCalls = 0;
  const context = {
    group: { expressionSyntaxVersion: 3, runtimeSupport: { status: "supported", reasons: [] } },
    checkEntryPrerequisites: () => { prerequisiteCalls += 1; return { ok: true, failureReasons: [] }; },
  };
  const option = {
    expressionSyntaxVersion: 3,
    description: "Gain the reaction described by the referenced Technique.",
    grants: [{ type: "technique", key: "example-reaction" }],
    runtimeSupport: { status: "deferred", reasons: ["draft-record-granted"] },
  };
  const blocked = OptionGroupWidget.prototype.checkAvailability.call(context, option);
  assert.equal(blocked.ok, false);
  assert.match(blocked.failureReasons[0], /granted technique is not marked playable/);
  assert.doesNotMatch(blocked.failureReasons[0], /mechanics|incomplete/i);
  assert.equal(prerequisiteCalls, 0);
  const ready = { ...option, runtimeSupport: { status: "supported", reasons: [] } };
  assert.equal(OptionGroupWidget.prototype.checkAvailability.call(context, ready).ok, true);
  assert.equal(prerequisiteCalls, 1);
});
