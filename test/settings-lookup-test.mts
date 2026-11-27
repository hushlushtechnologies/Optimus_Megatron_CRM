import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  LOOKUP_TABLES,
  UNCONFIGURABLE,
  findLookupTable,
  fullyEditableLookupTables,
  lookupTablesFor,
  unconfigurableFor,
} from "../src/lib/types/lookup-registry.ts";
import { buildLookupWrite } from "../src/lib/utils/lookup-payload.ts";

let checks = 0;
const check = (name: string, fn: () => void) => {
  fn();
  checks += 1;
  void name;
};

const spec = (id: string) => {
  const found = findLookupTable(id);
  assert.ok(found, `registry is missing ${id}`);
  return found;
};

const input = (over: Partial<Parameters<typeof buildLookupWrite>[1]> = {}) => ({
  label: "Something",
  isActive: true,
  sortOrder: 10,
  parentKey: null,
  extra: {} as Record<string, string>,
  ...over,
});

/* ---------------------------------------------------------------------------
 * The registry holds together
 * ------------------------------------------------------------------------- */

check("ids and tables are unique", () => {
  const ids = LOOKUP_TABLES.map((entry) => entry.id);
  const tables = LOOKUP_TABLES.map((entry) => entry.table);
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
  assert.equal(new Set(tables).size, tables.length, "duplicate table");
});

check("every rename-only table explains itself", () => {
  // Without this, a restricted list shows a lock icon and no reason, which
  // reads as something being broken rather than something being careful.
  LOOKUP_TABLES.filter((entry) => entry.mode === "rename").forEach((entry) => {
    assert.ok(
      entry.restriction && entry.restriction.length > 60,
      `${entry.id} is rename-only with no real explanation`,
    );
  });
});

check("every table says what records use it", () => {
  LOOKUP_TABLES.forEach((entry) => {
    assert.ok(entry.usedBy.length > 20, `${entry.id} does not say what uses it`);
  });
});

check("every group has at least one table and the three pages exist", () => {
  const groups = ["inventory", "crm", "enquiries"] as const;
  const routes: Record<string, string> = {
    inventory: "app/admin/settings/operations/inventory/page.tsx",
    crm: "app/admin/settings/operations/crm/page.tsx",
    enquiries: "app/admin/settings/operations/enquiries/page.tsx",
  };
  groups.forEach((group) => {
    assert.ok(lookupTablesFor(group).length > 0, `${group} has no tables`);
    assert.ok(existsSync(routes[group]), `${group} has no route file at ${routes[group]}`);
  });
});

check("no declared field collides with a column the editor manages itself", () => {
  /*
   * The dangerous one is is_active. If a spec declared it as an editable
   * field, a rename-only list would hand the client a way to switch values
   * off through the extras map — the exact thing the mode exists to prevent.
   */
  const reserved = new Set(["is_active", "sort_order", "slug", "id", "key"]);
  LOOKUP_TABLES.forEach((entry) => {
    entry.fields.forEach((field) => {
      assert.ok(
        !reserved.has(field.column),
        `${entry.id} declares ${field.column} as an editable field, which the editor manages itself`,
      );
      assert.notEqual(
        field.column,
        entry.labelColumn,
        `${entry.id} declares its own label column as an extra field`,
      );
    });
  });
});

check("every choice field has choices, and every choice has a label", () => {
  LOOKUP_TABLES.forEach((entry) => {
    entry.fields
      .filter((field) => field.kind === "choice")
      .forEach((field) => {
        assert.ok(field.choices && field.choices.length >= 2, `${entry.id}.${field.column} has no choices`);
        field.choices?.forEach((choice) => {
          assert.ok(choice.value.length > 0 && choice.label.length > 0);
        });
      });
  });
});

check("a parent's table is itself in the registry", () => {
  // models' parent is brands, variants' parent is models. If a parent were
  // not editable here, you could not create the thing you need to file under.
  const tables = new Set(LOOKUP_TABLES.map((entry) => entry.table));
  LOOKUP_TABLES.filter((entry) => entry.parent).forEach((entry) => {
    assert.ok(tables.has(entry.parent!.table), `${entry.id} has a parent that is not in the registry`);
  });
});

check("the Sprint 7 tables are the only ones keyed by text", () => {
  LOOKUP_TABLES.forEach((entry) => {
    if (entry.keyColumn === "key") {
      assert.ok(entry.table.startsWith("enquiry_"), `${entry.id} is keyed by text but is not an enquiry table`);
      assert.equal(entry.labelColumn, "label");
    }
  });
});

check("every unconfigurable item names a real group and gives a reason", () => {
  const groups = new Set(["inventory", "crm", "enquiries"]);
  UNCONFIGURABLE.forEach((item) => {
    assert.ok(groups.has(item.group), `${item.label} is in an unknown group`);
    assert.ok(item.reason.length > 50, `${item.label} has no real reason`);
  });
  assert.ok(unconfigurableFor("inventory").length >= 3);
  assert.ok(unconfigurableFor("crm").length >= 3);
  assert.ok(unconfigurableFor("enquiries").length >= 2);
});

check("a label does not appear as both a table and an unconfigurable item", () => {
  // Listing "Lead stages" as an editor AND as not-configurable would be a
  // direct contradiction on the same screen.
  const tableLabels = new Set(LOOKUP_TABLES.map((entry) => entry.label.toLowerCase()));
  UNCONFIGURABLE.forEach((item) => {
    assert.ok(
      !tableLabels.has(item.label.toLowerCase()),
      `${item.label} is listed both as an editor and as not configurable`,
    );
  });
});

check("the four constrained tables are exactly the ones expected", () => {
  const restricted = LOOKUP_TABLES.filter((entry) => entry.mode === "rename").map((entry) => entry.id).sort();
  assert.deepEqual(restricted, ["enquiry-statuses", "enquiry-types", "lead-stages", "vehicle-statuses"]);
  assert.equal(fullyEditableLookupTables().length, LOOKUP_TABLES.length - 4);
});

/* ---------------------------------------------------------------------------
 * What actually gets written
 * ------------------------------------------------------------------------- */

check("a rename-only table refuses a new row", () => {
  const result = buildLookupWrite(spec("lead-stages"), input(), true);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /can't be added here/);
});

check("a rename-only table accepts a rename", () => {
  const result = buildLookupWrite(spec("lead-stages"), input({ label: "Contacted" }), false);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.name, "Contacted");
});

check("a rename-only table never writes is_active", () => {
  // The whole point of the mode. If this regresses, the four constrained
  // lists become switchable off through an action that hid the button.
  const result = buildLookupWrite(spec("lead-stages"), input({ isActive: false }), false);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal("is_active" in result.payload, false);
});

check("a rename-only table never writes its other columns either", () => {
  // stage_type is the one that matters: it decides whether a lead counts as
  // won, lost or open in every report.
  const result = buildLookupWrite(
    spec("lead-stages"),
    input({ extra: { stage_type: "won", color_hex: "#ff0000" } }),
    false,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal("stage_type" in result.payload, false);
    assert.equal("color_hex" in result.payload, false);
  }
});

check("a full table does write is_active", () => {
  const result = buildLookupWrite(spec("customer-tags"), input({ isActive: false }), false);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.is_active, false);
});

check("a column the registry never declared is dropped", () => {
  const result = buildLookupWrite(
    spec("brands"),
    input({ extra: { is_active: "false", slug: "hacked", logo_url: "http://x" } }),
    false,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.slug, undefined);
    assert.equal(result.payload.logo_url, undefined);
    // is_active comes from the input flag, not from the extras map.
    assert.equal(result.payload.is_active, true);
  }
});

check("slug is never written, on any table", () => {
  LOOKUP_TABLES.forEach((entry) => {
    const result = buildLookupWrite(entry, input({ extra: { slug: "anything" } }), false);
    if (result.ok) assert.equal("slug" in result.payload, false, `${entry.id} wrote slug`);
  });
});

check("a choice value outside its options is dropped, not written", () => {
  const result = buildLookupWrite(
    spec("vehicle-statuses"),
    input({ extra: { category: "something_else" } }),
    false,
  );
  // vehicle-statuses is rename-only, so nothing extra is written anyway;
  // customer-sources is the full-table version of the same check.
  assert.equal(result.ok, true);

  const full = buildLookupWrite(
    spec("customer-sources"),
    input({ extra: { requires_detail: "maybe" } }),
    false,
  );
  assert.equal(full.ok, true);
  if (full.ok) assert.equal("requires_detail" in full.payload, false);
});

check('a choice of "true"/"false" becomes a real boolean', () => {
  const on = buildLookupWrite(spec("customer-sources"), input({ extra: { requires_detail: "true" } }), false);
  const off = buildLookupWrite(spec("customer-sources"), input({ extra: { requires_detail: "false" } }), false);
  assert.equal(on.ok, true);
  assert.equal(off.ok, true);
  if (on.ok) assert.equal(on.payload.requires_detail, true);
  if (off.ok) assert.equal(off.payload.requires_detail, false);
});

check("an empty optional text column is written as null, not an empty string", () => {
  const result = buildLookupWrite(spec("collections"), input({ extra: { description: "   " } }), false);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.description, null);
});

check("a child needs a parent when it is created", () => {
  const without = buildLookupWrite(spec("models"), input({ parentKey: null }), true);
  assert.equal(without.ok, false);
  if (!without.ok) assert.match(without.error, /choose a brand/i);

  const with_ = buildLookupWrite(spec("models"), input({ parentKey: "brand-uuid" }), true);
  assert.equal(with_.ok, true);
  if (with_.ok) assert.equal(with_.payload.brand_id, "brand-uuid");
});

check("an existing child never has its parent rewritten", () => {
  // A variant moving to another model changes what every vehicle carrying it
  // claims to be.
  const result = buildLookupWrite(spec("variants"), input({ parentKey: "a-different-model" }), false);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal("model_id" in result.payload, false);
});

check("a blank or oversized name is refused", () => {
  assert.equal(buildLookupWrite(spec("brands"), input({ label: "   " }), false).ok, false);
  assert.equal(buildLookupWrite(spec("brands"), input({ label: "x".repeat(121) }), false).ok, false);
  assert.equal(buildLookupWrite(spec("brands"), input({ label: "x".repeat(120) }), false).ok, true);
});

check("a name is trimmed before it is written", () => {
  const result = buildLookupWrite(spec("brands"), input({ label: "  Porsche  " }), false);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.name, "Porsche");
});

check("display order is bounded", () => {
  assert.equal(buildLookupWrite(spec("brands"), input({ sortOrder: -1 }), false).ok, false);
  assert.equal(buildLookupWrite(spec("brands"), input({ sortOrder: 10000 }), false).ok, false);
  assert.equal(buildLookupWrite(spec("brands"), input({ sortOrder: 1.5 }), false).ok, false);
  assert.equal(buildLookupWrite(spec("brands"), input({ sortOrder: 0 }), false).ok, true);
});

check("an over-long description is refused rather than silently truncated", () => {
  const result = buildLookupWrite(
    spec("collections"),
    input({ extra: { description: "x".repeat(301) } }),
    false,
  );
  assert.equal(result.ok, false);
});

check("the enquiry tables write label, not name", () => {
  const result = buildLookupWrite(spec("enquiry-sources"), input({ label: "Walk-in" }), false);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.label, "Walk-in");
    assert.equal("name" in result.payload, false);
  }
});

check("no write on any table ever includes a delete-shaped intent", () => {
  // There is no delete action; this asserts the payload shape cannot smuggle
  // one in through a column name.
  LOOKUP_TABLES.forEach((entry) => {
    const result = buildLookupWrite(entry, input(), false);
    if (result.ok) {
      Object.keys(result.payload).forEach((column) => {
        assert.ok(!/delete|remove|drop/i.test(column), `${entry.id} writes ${column}`);
      });
    }
  });
});

console.log(`settings-lookup: ${checks} checks, all passed.`);
