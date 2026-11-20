import { enquiryValuationSchema, matchDreamCarSchema } from "@/src/lib/validation/enquiry-valuation";

const V = "11111111-1111-4111-8111-111111111111";
let fails = 0;

function check(label: string, input: unknown, want: "ok" | string) {
  const r = enquiryValuationSchema.safeParse(input);
  if (want === "ok") {
    if (!r.success) {
      console.log(`FAIL ${label}: expected ok, got ${r.error.issues[0].message}`);
      fails++;
    } else console.log(`ok   ${label} -> expires=${JSON.stringify(r.data.offerExpiresOn)}`);
    return;
  }
  if (r.success) {
    console.log(`FAIL ${label}: expected rejection on ${want}, was accepted`);
    fails++;
    return;
  }
  const path = r.error.issues[0].path.join(".");
  if (path !== want) {
    console.log(`FAIL ${label}: rejected on "${path}", expected "${want}"`);
    fails++;
  } else console.log(`ok   ${label} -> rejected on ${path}: ${r.error.issues[0].message}`);
}

const base = { vehicleId: V, estimatedValue: "", valuationNotes: "", proposedOffer: "", offerExpiresOn: "" };

check("all blank clears everything", base, "ok");
check("estimate only", { ...base, estimatedValue: 55000 }, "ok");
check("offer below estimate, no note", { ...base, estimatedValue: 55000, proposedOffer: 50000 }, "ok");
check(
  "offer with expiry",
  { ...base, estimatedValue: 55000, proposedOffer: 50000, offerExpiresOn: "2026-12-01" },
  "ok",
);

// The two guards.
check(
  "expiry with no offer",
  { ...base, estimatedValue: 55000, offerExpiresOn: "2026-12-01" },
  "offerExpiresOn",
);
check(
  "offer above estimate, no note",
  { ...base, estimatedValue: 50000, proposedOffer: 60000 },
  "valuationNotes",
);
check(
  "offer above estimate, with note",
  {
    ...base,
    estimatedValue: 50000,
    proposedOffer: 60000,
    valuationNotes: "Sought-after spec, makes the deal work.",
  },
  "ok",
);

// Money bounds and shape.
check("negative estimate", { ...base, estimatedValue: -1 }, "estimatedValue");
check("absurd estimate", { ...base, estimatedValue: 100_000_001 }, "estimatedValue");
check("bad date shape", { ...base, proposedOffer: 10, offerExpiresOn: "01-12-2026" }, "offerExpiresOn");
check("not a uuid", { ...base, vehicleId: "nope" }, "vehicleId");

// Expiry must land at end of the Dubai day, not midnight UTC.
const r = enquiryValuationSchema.safeParse({ ...base, proposedOffer: 10, offerExpiresOn: "2026-12-01" });
if (r.success) {
  const got = r.data.offerExpiresOn;
  if (got !== "2026-12-01T23:59:59+04:00") {
    console.log(`FAIL expiry stamp: ${got}`);
    fails++;
  } else console.log(`ok   expiry is end of the Dubai day: ${got}`);
}

// Matching: a person's choice, and clearable.
for (const [label, input, want] of [
  ["match a car", { enquiryId: V, carId: V }, true],
  ["clear the match", { enquiryId: V, carId: null }, true],
  ["carId missing entirely", { enquiryId: V }, false],
] as [string, unknown, boolean][]) {
  const m = matchDreamCarSchema.safeParse(input);
  if (m.success !== want) {
    console.log(`FAIL ${label}`);
    fails++;
  } else console.log(`ok   ${label}`);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
