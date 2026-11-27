import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_MODULES,
  allCataloguedTypes,
  filterableModules,
  findNotificationEvent,
  isActionable,
  isMandatory,
  moduleFilter,
  notificationModule,
  preferenceGroups,
  typesForModule,
} from "../src/lib/types/notification-catalog.ts";

let checks = 0;
const check = (name: string, fn: () => void) => {
  fn();
  checks += 1;
  void name;
};

/* ---------------------------------------------------------------------------
 * The catalog describes what is actually sent
 * ------------------------------------------------------------------------- */

check("every type the helpers send is in the catalog", () => {
  /*
   * The one that matters most. A type the code sends but the catalog does not
   * know gets no preference toggle, lands in the "system" filter, and shows
   * no module — all silently. So this reads the real helper files rather than
   * trusting the catalog to be complete.
   */
  const helpers = [
    "src/lib/notifications/lead-notifications.ts",
    "src/lib/notifications/test-drive-notifications.ts",
    "src/lib/notifications/enquiry-notifications.ts",
    "src/lib/notifications/offer-notifications.ts",
    "app/admin/sales/payment-actions.ts",
  ];

  const sent = new Set<string>();
  helpers.forEach((path) => {
    assert.ok(existsSync(path), `${path} is missing — this test's file list is stale`);
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/type:\s*"([a-z_]+)"/g)) {
      sent.add(match[1]);
    }
  });

  assert.ok(sent.size >= 15, `only found ${sent.size} notification types in the helpers`);

  const catalogued = new Set(allCataloguedTypes());
  const missing = [...sent].filter((type) => !catalogued.has(type)).sort();
  assert.deepEqual(missing, [], `these types are sent but not catalogued: ${missing.join(", ")}`);
});

check("the catalog does not describe types nothing sends", () => {
  // The other direction: a catalogued type nothing sends puts a toggle on the
  // preferences page for a notification that can never arrive.
  const helpers = [
    "src/lib/notifications/lead-notifications.ts",
    "src/lib/notifications/test-drive-notifications.ts",
    "src/lib/notifications/enquiry-notifications.ts",
    "src/lib/notifications/offer-notifications.ts",
    "src/lib/notifications/create-notification.ts",
  ];
  const sent = new Set<string>();
  helpers.forEach((path) => {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/type:\s*"([a-z_]+)"/g)) sent.add(match[1]);
  });

  const orphans = allCataloguedTypes().filter((type) => !sent.has(type)).sort();
  assert.deepEqual(orphans, [], `catalogued but never sent: ${orphans.join(", ")}`);
});

check("no duplicate types", () => {
  const types = NOTIFICATION_EVENTS.map((event) => event.type);
  assert.equal(new Set(types).size, types.length);
});

check("every event names a module that exists", () => {
  const ids = new Set(NOTIFICATION_MODULES.map((module) => module.id));
  NOTIFICATION_EVENTS.forEach((event) => {
    assert.ok(ids.has(event.module), `${event.type} is in unknown module ${event.module}`);
  });
});

check("every event has a trigger, a recipient note and a dedupe rule", () => {
  // Phase 19 asks for these per event. A blank one is a row in the matrix
  // that says nothing.
  NOTIFICATION_EVENTS.forEach((event) => {
    assert.ok(event.trigger.length > 20, `${event.type} has no real trigger`);
    assert.ok(event.recipientNote.length > 10, `${event.type} does not say who gets it`);
    assert.ok(event.dedupe.length > 4, `${event.type} has no dedupe rule`);
    assert.ok(event.label.length > 5, `${event.type} has no label`);
  });
});

check("every mandatory event explains why", () => {
  NOTIFICATION_EVENTS.filter((event) => event.mandatory).forEach((event) => {
    assert.ok(
      event.mandatoryReason && event.mandatoryReason.length > 40,
      `${event.type} is mandatory with no real reason`,
    );
  });
});

check("mandatory is a short list, and is the financial one", () => {
  // Marking everything mandatory would make the preferences page pointless
  // and train people to ignore the bell. These two are the money ones.
  const mandatory = NOTIFICATION_EVENTS.filter((event) => event.mandatory).map((event) => event.type);
  assert.deepEqual(mandatory.sort(), ["payment_verification_required", "points_adjusted"]);
  assert.ok(mandatory.length < NOTIFICATION_EVENTS.length / 3, "too much is mandatory");
});

/* ---------------------------------------------------------------------------
 * Preference groups
 * ------------------------------------------------------------------------- */

check("every event belongs to exactly one preference group", () => {
  const groups = preferenceGroups();
  NOTIFICATION_EVENTS.forEach((event) => {
    const owners = groups.filter((group) => group.types.includes(event.type));
    assert.equal(owners.length, 1, `${event.type} is in ${owners.length} groups`);
  });
});

check("a group is mandatory only if every event in it is", () => {
  /*
   * The trap this guards: one optional event sharing a toggle with a
   * mandatory one. The group would render as always-on and the optional
   * notification would become unswitchable without anybody deciding that.
   */
  preferenceGroups().forEach((group) => {
    const events = group.types.map((type) => findNotificationEvent(type)!);
    const allMandatory = events.every((event) => event.mandatory);
    assert.equal(
      group.mandatory,
      allMandatory,
      `group ${group.key} is mandatory=${group.mandatory} but its events are ${events.map((e) => e.mandatory).join(",")}`,
    );
  });
});

check("a mandatory event is never filed under a switchable group", () => {
  /*
   * Found by mutation testing: moving points_adjusted under loyalty_activity
   * leaves the group switchable, because a mixed group is computed as
   * optional. The gate still protects the event — it checks mandatory before
   * it looks at any preference — so nothing would actually stop arriving.
   *
   * What breaks is the truth of the screen. Someone switches "Loyalty
   * activity" off, the database stores it, the page shows it off, and manual
   * adjustment notices keep coming. They would reasonably conclude the
   * setting is broken, and the one notification the brief insists stays on is
   * the one they are trying to silence.
   */
  const groups = preferenceGroups();
  NOTIFICATION_EVENTS.filter((event) => event.mandatory).forEach((event) => {
    const group = groups.find((candidate) => candidate.types.includes(event.type));
    assert.ok(group, `${event.type} is in no group`);
    assert.equal(
      group.mandatory,
      true,
      `${event.type} is mandatory but its group ${group.key} is switchable, so the page would show it off while it kept arriving`,
    );
  });
});

check("every group has a label and a description of its own", () => {
  preferenceGroups().forEach((group) => {
    assert.ok(group.label.length > 3, `${group.key} has no label`);
    assert.ok(group.description.length > 20, `${group.key} has no description`);
    // A description that is just the trigger text means the label map is
    // missing an entry, so the page would show developer phrasing.
    assert.notEqual(group.description, findNotificationEvent(group.types[0])?.trigger);
  });
});

check("every mandatory group carries its reason through to the page", () => {
  preferenceGroups()
    .filter((group) => group.mandatory)
    .forEach((group) => {
      assert.ok(group.mandatoryReason, `${group.key} is mandatory with no reason to show`);
    });
});

/* ---------------------------------------------------------------------------
 * Filtering
 * ------------------------------------------------------------------------- */

check("an unknown type goes to system rather than disappearing", () => {
  // It still counts toward the unread badge, so it has to be reachable from
  // some filter or it is unread for ever with nowhere to read it.
  assert.equal(notificationModule("something_nobody_catalogued"), "system");
  assert.equal(notificationModule("lead_assigned"), "leads");
});

check("system filters by exclusion, not by a list of types", () => {
  const filter = moduleFilter("system");
  assert.equal(filter.kind, "not_in");
  // Filtering system by its own (empty) type list would return nothing and
  // hide exactly the notifications that need attention.
  assert.ok(filter.types.length > 10, "the exclusion list should name every known type");
  assert.ok(filter.types.includes("lead_assigned"));
});

check("every other module filters by inclusion", () => {
  NOTIFICATION_MODULES.filter((module) => module.id !== "system").forEach((module) => {
    const filter = moduleFilter(module.id);
    assert.equal(filter.kind, "in", `${module.id} should filter by inclusion`);
  });
});

check("a live module's inclusion list is not empty", () => {
  // A live module with no types would render a chip that always returns
  // nothing.
  NOTIFICATION_MODULES.filter((module) => module.live).forEach((module) => {
    assert.ok(
      typesForModule(module.id).length > 0,
      `${module.id} is marked live but has no notification types`,
    );
  });
});

check("a module with no types must say so and must not be live", () => {
  NOTIFICATION_MODULES.filter((module) => typesForModule(module.id).length === 0).forEach((module) => {
    assert.equal(module.live, false, `${module.id} has no types but is marked live`);
    assert.ok(module.gap && module.gap.length > 40, `${module.id} is empty with no explanation`);
  });
});

check("an empty module is not offered as a filter unless something is there", () => {
  const withNothing = filterableModules([]).map((module) => module.id);
  assert.ok(!withNothing.includes("reservations"), "reservations has nothing and should not be offered");
  assert.ok(withNothing.includes("leads"));

  // But if an uncatalogued notification exists, system becomes reachable.
  const withStray = filterableModules(["a_type_from_the_future"]).map((module) => module.id);
  assert.ok(withStray.includes("system"), "system must be offered once something lands in it");
});

check("actionable is only true where the recipient must do something", () => {
  assert.equal(isActionable("follow_up_due"), true);
  assert.equal(isActionable("payment_verification_required"), true);
  // Being told a lead was taken off you is information, not a task.
  assert.equal(isActionable("lead_reassigned"), false);
  assert.equal(isActionable("points_earned"), false);
  assert.equal(isActionable("a_type_nobody_catalogued"), false);
});

check("isMandatory is false for an unknown type", () => {
  // Fails toward "switchable", matching the gate, which fails toward sending.
  assert.equal(isMandatory("a_type_nobody_catalogued"), false);
  assert.equal(isMandatory("points_adjusted"), true);
});

check("only payment verification routes by role", () => {
  /*
   * Every other helper sends to one named person. Role routing reaches
   * several people at once, so a second one appearing here should be a
   * deliberate decision rather than a copy-paste — hence the assertion.
   */
  const byRole = NOTIFICATION_EVENTS.filter((event) => event.recipient === "role").map((e) => e.type);
  assert.deepEqual(byRole, ["payment_verification_required"]);
});

console.log(`notification-catalog: ${checks} checks, all passed.`);
