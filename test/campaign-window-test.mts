import { describeCampaignWindow, dubaiDay } from "../src/lib/utils/campaign-window";

let fails = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(`FAIL ${l}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    fails++;
  } else console.log(`ok   ${l} = ${JSON.stringify(got)}`);
};

const NOW = Date.parse("2026-11-20T12:00:00Z");
const d = (iso: string) => iso;

console.log("--- Dubai day boundaries ---");
eq("20:05Z on the 19th is the 20th in Dubai", dubaiDay("2026-11-19T20:05:00Z"), "2026-11-20");
eq("19:59Z is still the 19th", dubaiDay("2026-11-19T19:59:00Z"), "2026-11-19");

console.log("\n--- no dates ---");
const open = describeCampaignWindow(null, null, NOW);
eq("label", open.label, "No dates set — runs until paused");
eq("no progress bar for an open-ended campaign", open.progress, null);
eq("no remaining", open.remaining, null);
eq("not ended", open.hasEnded, false);

console.log("\n--- a bounded window, halfway through ---");
const half = describeCampaignWindow(d("2026-11-10T12:00:00Z"), d("2026-11-30T12:00:00Z"), NOW);
eq("progress is 50%", Math.round(half.progress!), 50);
eq("10 days left", half.remaining, "10 days left");
eq("not ended", half.hasEnded, false);

console.log("\n--- start only: no progress to show ---");
const fromOnly = describeCampaignWindow(d("2026-11-10T12:00:00Z"), null, NOW);
eq("no progress without an end", fromOnly.progress, null);
eq("no remaining without an end", fromOnly.remaining, null);

console.log("\n--- remaining, in the units a person uses ---");
const rem = (hours: number) =>
  describeCampaignWindow(d("2026-01-01T00:00:00Z"), new Date(NOW + hours * 3600_000).toISOString(), NOW)
    .remaining;
eq("20 hours away", rem(20), "ends today");
eq("5 days", rem(5 * 24), "5 days left");
eq("3 weeks", rem(21 * 24), "3 weeks left");
eq("3 months", rem(90 * 24), "3 months left");
eq("already past", rem(-5), "ended");

console.log("\n--- progress clamps, never out of range ---");
const past = describeCampaignWindow(d("2026-01-01T00:00:00Z"), d("2026-02-01T00:00:00Z"), NOW);
eq("a finished campaign shows 100, not 900", Math.round(past.progress!), 100);
eq("…and says it ended", past.hasEnded, true);
const future = describeCampaignWindow(d("2027-01-01T00:00:00Z"), d("2027-02-01T00:00:00Z"), NOW);
eq("a future campaign shows 0, not negative", Math.round(future.progress!), 0);
eq("…and says it hasn't started", future.notStarted, true);

console.log("\n--- an end before the start can't be measured ---");
eq(
  "no progress for a reversed window",
  describeCampaignWindow(d("2026-12-01T00:00:00Z"), d("2026-11-01T00:00:00Z"), NOW).progress,
  null,
);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
