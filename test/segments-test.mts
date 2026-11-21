import {
  SEGMENT_PRESETS,
  applyPreset,
  matchingPresets,
  type SegmentRule,
} from "../src/lib/utils/offer-segments.ts";

/*
 * Segment presets are shorthand that expands into eligibility rules.
 *
 * The case worth testing hardest: eligibility rules are ANDed, so two
 * lifecycle_status rules would both have to pass, and nobody is VIP and
 * Active at the same time. Applying a second status preset must REPLACE the
 * first, not add to it — otherwise clicking two chips builds a segment that
 * matches nobody and says nothing about why.
 */

let pass = 0;
let fail = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a === b) {
    console.log(`ok   ${label}`);
    pass += 1;
  } else {
    console.log(`FAIL ${label}`);
    console.log(`       expected ${b}`);
    console.log(`       actual   ${a}`);
    fail += 1;
  }
}

console.log("\n--- applying one preset ---");

{
  const r = applyPreset([], "vip");
  eq("VIP writes one lifecycle rule", r, [
    { ruleKind: "lifecycle_status", operator: "in", value: "VIP" },
  ]);
  eq("  and the chip lights up", matchingPresets(r), ["vip"]);
}

{
  const r = applyPreset([], "repeat_buyer");
  eq("Repeat buyer writes a count rule", r, [
    { ruleKind: "min_completed_deals", operator: "gte", value: "2" },
  ]);
}

{
  const r = applyPreset([], "high_value");
  eq("High value is in dirhams, not fils", r, [
    { ruleKind: "min_lifetime_spend_fils", operator: "gte", value: "500000" },
  ]);
}

console.log("\n--- two statuses must not stack ---");

{
  const vip = applyPreset([], "vip");
  const both = applyPreset(vip, "active");

  eq("Active replaces VIP rather than adding", both, [
    { ruleKind: "lifecycle_status", operator: "in", value: "Active" },
  ]);
  eq("  only Active is lit", matchingPresets(both), ["active"]);
  eq("  exactly one rule, not two", both.length, 1);
}

{
  /* Same trap in the other direction: existing vs new customer. */
  const existing = applyPreset([], "existing");
  const now_new = applyPreset(existing, "new");

  eq("New replaces Existing", now_new, [
    { ruleKind: "is_existing_customer", operator: "eq", value: "false" },
  ]);
  eq("  one rule", now_new.length, 1);
}

console.log("\n--- different kinds DO combine ---");

{
  let rules: SegmentRule[] = [];
  rules = applyPreset(rules, "vip");
  rules = applyPreset(rules, "repeat_buyer");
  rules = applyPreset(rules, "high_value");

  eq("VIP + repeat + high value is three rules", rules.length, 3);
  eq("  all three chips lit", matchingPresets(rules).sort(), ["high_value", "repeat_buyer", "vip"]);
}

console.log("\n--- chips toggle off ---");

{
  const on = applyPreset([], "vip");
  const off = applyPreset(on, "vip");

  eq("clicking VIP twice removes it", off, []);
  eq("  nothing lit", matchingPresets(off), []);
}

{
  let rules: SegmentRule[] = [];
  rules = applyPreset(rules, "vip");
  rules = applyPreset(rules, "repeat_buyer");
  rules = applyPreset(rules, "vip");

  eq("removing VIP leaves repeat buyer alone", rules, [
    { ruleKind: "min_completed_deals", operator: "gte", value: "2" },
  ]);
}

console.log("\n--- a hand-edited rule stops being a segment ---");

{
  /* Editing the threshold means it is no longer that preset, which is
     correct: the chip must not claim a segment the rules no longer are. */
  const edited: SegmentRule[] = [
    { ruleKind: "min_completed_deals", operator: "gte", value: "5" },
  ];

  eq("5 purchases is not the 'repeat buyer' preset", matchingPresets(edited), []);
  eq("  but the rule is still there", edited.length, 1);
}

console.log("\n--- nonsense input is survivable ---");

eq("unknown preset changes nothing", applyPreset([], "not_a_preset"), []);

{
  const existing: SegmentRule[] = [
    { ruleKind: "customer_tag", operator: "in", value: "tag-1" },
  ];
  eq("unknown preset leaves rules alone", applyPreset(existing, "nope"), existing);
}

console.log("\n--- every preset is self-consistent ---");

for (const preset of SEGMENT_PRESETS) {
  const applied = applyPreset([], preset.key);

  eq(`${preset.key}: applying it makes it match`, matchingPresets(applied).includes(preset.key), true);
  eq(`${preset.key}: applying twice clears it`, applyPreset(applied, preset.key).length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);

if (fail > 0) process.exit(1);
console.log("ALL PASS");
