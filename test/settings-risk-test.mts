import assert from "node:assert/strict";
import {
  discountThresholdChange,
  feesEnabledChange,
  minDepositChange,
  separateVerifierChange,
} from "../src/lib/utils/settings-risk.ts";
import {
  ALL_HISTORY_SCOPES,
  COMPANY_HISTORY,
  PAYMENT_HISTORY,
  RESERVATION_HISTORY,
  SALES_HISTORY,
  SETTINGS_COLUMNS,
  inHistoryScope,
} from "../src/lib/utils/settings-history-scope.ts";
import { changedKeys } from "../src/lib/utils/sales-settings-history.ts";
import { isUndefinedColumnError } from "../src/lib/utils/settings-db-errors.ts";

let checks = 0;
const check = (name: string, fn: () => void) => {
  fn();
  checks += 1;
  void name;
};

/* ---------------------------------------------------------------------------
 * Direction of each safeguard
 *
 * The thing being guarded against: two of these three are percentages in
 * identical-looking fields, and they move opposite ways. Raising the discount
 * threshold relaxes review; raising the deposit needed to confirm tightens it.
 * Getting one backwards would colour a tightening as dangerous and wave a
 * loosening through, and the colour is what people actually read.
 * ------------------------------------------------------------------------- */

check("no change returns null, so nothing is confirmed that did not move", () => {
  assert.equal(discountThresholdChange(5, 5), null);
  assert.equal(minDepositChange(20, 20), null);
  assert.equal(separateVerifierChange(true, true), null);
  assert.equal(separateVerifierChange(false, false), null);
  assert.equal(feesEnabledChange(true, true), null);
});

check("raising the discount threshold LOOSENS", () => {
  const change = discountThresholdChange(5, 15);
  assert.ok(change);
  assert.equal(change.direction, "loosens");
  assert.equal(change.before, "5%");
  assert.equal(change.after, "15%");
});

check("lowering the discount threshold TIGHTENS", () => {
  const change = discountThresholdChange(15, 5);
  assert.ok(change);
  assert.equal(change.direction, "tightens");
});

check("discount threshold to 0 tightens, and says every discount needs approval", () => {
  const change = discountThresholdChange(5, 0);
  assert.ok(change);
  assert.equal(change.direction, "tightens");
  assert.match(change.effect, /every discount will need approval/i);
});

check("discount threshold off 0 loosens — 0 is the strictest, not a disabled state", () => {
  // Worth stating: 0 could be read as "no threshold set, so no checking".
  // It means the opposite, and a change away from it is a relaxation.
  const change = discountThresholdChange(0, 10);
  assert.ok(change);
  assert.equal(change.direction, "loosens");
});

check("discount threshold at 100 says nobody reviews discounts again", () => {
  const change = discountThresholdChange(10, 100);
  assert.ok(change);
  assert.equal(change.direction, "loosens");
  assert.match(change.effect, /every discount will be approved automatically/i);
});

check("LOWERING the deposit needed to confirm LOOSENS — the opposite of discount", () => {
  const change = minDepositChange(20, 10);
  assert.ok(change);
  assert.equal(change.direction, "loosens");
});

check("raising the deposit needed to confirm TIGHTENS", () => {
  const change = minDepositChange(10, 20);
  assert.ok(change);
  assert.equal(change.direction, "tightens");
});

check("deposit to confirm at 0 loosens, and names the consequence plainly", () => {
  const change = minDepositChange(20, 0);
  assert.ok(change);
  assert.equal(change.direction, "loosens");
  assert.match(change.effect, /no payment verified at all/i);
});

check("the two percentage fields disagree on the same numeric move", () => {
  // The regression this file exists to catch, stated as one assertion.
  const discount = discountThresholdChange(10, 20);
  const deposit = minDepositChange(10, 20);
  assert.ok(discount && deposit);
  assert.equal(discount.direction, "loosens");
  assert.equal(deposit.direction, "tightens");
  assert.notEqual(discount.direction, deposit.direction);
});

check("turning the separate verifier OFF loosens", () => {
  const change = separateVerifierChange(true, false);
  assert.ok(change);
  assert.equal(change.direction, "loosens");
  assert.equal(change.after, "Off");
  assert.match(change.effect, /both record a payment and verify it/i);
});

check("turning the separate verifier ON tightens", () => {
  const change = separateVerifierChange(false, true);
  assert.ok(change);
  assert.equal(change.direction, "tightens");
});

check("fees is a change, not a safeguard, and says confirmed deals are untouched", () => {
  const off = feesEnabledChange(true, false);
  assert.ok(off);
  assert.equal(off.direction, "changes");
  assert.match(off.effect, /already on a confirmed deal/i);
});

check("every preview carries all five fields filled in", () => {
  const previews = [
    discountThresholdChange(5, 10),
    minDepositChange(20, 10),
    separateVerifierChange(true, false),
    feesEnabledChange(false, true),
  ];
  previews.forEach((preview) => {
    assert.ok(preview);
    assert.ok(preview.label.length > 3, "label");
    assert.ok(preview.before.length > 0, "before");
    assert.ok(preview.after.length > 0, "after");
    assert.ok(preview.effect.length > 25, "effect should be a sentence, not a word");
    assert.notEqual(preview.before, preview.after, "a preview of an unchanged value is meaningless");
  });
});

/* ---------------------------------------------------------------------------
 * History scoping
 * ------------------------------------------------------------------------- */

check("every settings column belongs to exactly one page", () => {
  // A column in no scope is a change no settings page ever shows. A column in
  // two is one change reported as two.
  SETTINGS_COLUMNS.forEach((column) => {
    const owners = ALL_HISTORY_SCOPES.filter((scope) => scope.settingsKeys.includes(column));
    assert.equal(
      owners.length,
      1,
      `${column} is owned by ${owners.length} scopes; it must be exactly 1`,
    );
  });
});

check("no scope claims a column that is not a settings column", () => {
  const known = new Set(SETTINGS_COLUMNS);
  ALL_HISTORY_SCOPES.forEach((scope) => {
    scope.settingsKeys.forEach((key) => {
      assert.ok(known.has(key), `${key} is claimed by a scope but is not a sales_settings column`);
    });
  });
});

check("a reservation change shows on reservations and nowhere else", () => {
  const old = { reservation_default_days: 3 };
  const next = { reservation_default_days: 5 };
  assert.equal(inHistoryScope("settings", old, next, RESERVATION_HISTORY), true);
  assert.equal(inHistoryScope("settings", old, next, SALES_HISTORY), false);
  assert.equal(inHistoryScope("settings", old, next, PAYMENT_HISTORY), false);
});

check("a payment safeguard change shows on payments and nowhere else", () => {
  const old = { payments_require_separate_verifier: true };
  const next = { payments_require_separate_verifier: false };
  assert.equal(inHistoryScope("settings", old, next, PAYMENT_HISTORY), true);
  assert.equal(inHistoryScope("settings", old, next, RESERVATION_HISTORY), false);
  assert.equal(inHistoryScope("settings", old, next, SALES_HISTORY), false);
});

check("a row the trigger wrote whole is scoped by what CHANGED, not what it carries", () => {
  /*
   * This is the one that makes scoping work at all. The database trigger
   * records the whole row in new_values, so every history row mentions every
   * column. If scoping went on presence rather than change, every page would
   * show every change and splitting the history would have achieved nothing.
   */
  const wholeRowBefore = {
    discount_auto_approve_percent: 5,
    fees_enabled: true,
    reservation_default_days: 3,
    reservation_max_days: 14,
    confirm_min_deposit_percent: 20,
    payments_require_separate_verifier: true,
  };
  const wholeRowAfter = { ...wholeRowBefore, reservation_default_days: 5 };

  assert.equal(inHistoryScope("settings", wholeRowBefore, wholeRowAfter, RESERVATION_HISTORY), true);
  assert.equal(inHistoryScope("settings", wholeRowBefore, wholeRowAfter, PAYMENT_HISTORY), false);
  assert.equal(inHistoryScope("settings", wholeRowBefore, wholeRowAfter, SALES_HISTORY), false);
});

check("a row where nothing changed belongs to no page", () => {
  const same = { reservation_default_days: 3, discount_auto_approve_percent: 5 };
  ALL_HISTORY_SCOPES.forEach((scope) => {
    assert.equal(inHistoryScope("settings", same, { ...same }, scope), false);
  });
});

check("bookkeeping columns alone are not a change", () => {
  const old = { reservation_default_days: 3, updated_at: "2026-11-01T00:00:00Z" };
  const next = { reservation_default_days: 3, updated_at: "2026-11-26T00:00:00Z" };
  assert.deepEqual(changedKeys(old, next), []);
  assert.equal(inHistoryScope("settings", old, next, RESERVATION_HISTORY), false);
});

check("fee and checklist rows go to sales; company rows go to company", () => {
  assert.equal(inHistoryScope("fee", null, { name: "Registration" }, SALES_HISTORY), true);
  assert.equal(inHistoryScope("checklist", null, { label: "Keys handed over" }, SALES_HISTORY), true);
  assert.equal(inHistoryScope("fee", null, { name: "Registration" }, PAYMENT_HISTORY), false);
  assert.equal(inHistoryScope("company", null, { legal_name: "Optimus" }, COMPANY_HISTORY), true);
  assert.equal(inHistoryScope("company", null, { legal_name: "Optimus" }, SALES_HISTORY), false);
});

check("a new fee with no old row still scopes in, despite having nothing to diff", () => {
  // Non-settings rows scope on entity alone, which is why an insert works.
  assert.equal(inHistoryScope("fee", null, { name: "Admin fee", value: 500 }, SALES_HISTORY), true);
});

/* ---------------------------------------------------------------------------
 * The missing-column fallback
 *
 * The showrooms page tries a wide query and narrows it when locations.address
 * does not exist. If this predicate were loose, a permission error or a
 * dropped connection would silently hide the address field instead of showing
 * an error, and the page would look like it had worked.
 * ------------------------------------------------------------------------- */

check("42703 is a missing column", () => {
  assert.equal(isUndefinedColumnError({ code: "42703", message: 'column "address" does not exist' }), true);
});

check("a message naming a missing column counts, even with no code", () => {
  assert.equal(isUndefinedColumnError({ message: 'column locations.address does not exist' }), true);
});

check("a missing TABLE is NOT a missing column", () => {
  // This one matters: "relation does not exist" means the showrooms table is
  // gone, which must surface as an error rather than as a hidden field.
  assert.equal(isUndefinedColumnError({ code: "42P01", message: 'relation "public.locations" does not exist' }), false);
});

check("a missing function is NOT a missing column", () => {
  assert.equal(
    isUndefinedColumnError({ code: "42883", message: "function public.get_my_permissions() does not exist" }),
    false,
  );
});

check("permission denied is NOT a missing column", () => {
  assert.equal(isUndefinedColumnError({ code: "42501", message: "permission denied for table locations" }), false);
});

check("a network failure is NOT a missing column", () => {
  assert.equal(isUndefinedColumnError({ message: "fetch failed" }), false);
  assert.equal(isUndefinedColumnError({ code: null, message: null }), false);
});

check("no error is not a missing column", () => {
  assert.equal(isUndefinedColumnError(null), false);
  assert.equal(isUndefinedColumnError(undefined), false);
});

console.log(`settings-risk: ${checks} checks, all passed.`);
