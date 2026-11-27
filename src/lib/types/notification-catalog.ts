/*
|------------------------------------------------------------------------------
| The notification event matrix
|------------------------------------------------------------------------------
|
| Phase 19 asks for "a documented notification event matrix", with a trigger,
| recipient, type, entity link, deduplication rule, preference policy,
| permission visibility and error behaviour for each event.
|
| This is that matrix, written as data rather than as a document, because a
| document goes stale the first time somebody adds a notification and a file
| the code reads does not. The filters on /admin/notifications, the toggles on
| the preferences page and the gate in createNotification all read this list.
|
| WHAT I CHECKED BEFORE WRITING IT
|
| Phase 17: "Do not fabricate a priority field without checking existing
| records and schema." Checked. The notifications table has exactly these
| columns:
|
|   recipient_id  type  title  description
|   entity_type   entity_id  actor_id  dedupe_key  read_at  created_at
|
| There is no priority column and no actionable column. So neither is stored
| and neither is invented: `actionable` below is a property of the EVENT —
| whether the recipient is expected to go and do something — and the screen
| labels it as derived from the type rather than reading it off the record.
|
| Deduplication is already solved: dedupe_key has a unique index, and
| createNotification treats error 23505 as success rather than as a failure,
| which is the right way round. Phase 19's deduplication rule is therefore a
| description of what each helper already passes, not something new.
|
| THE GAP THIS MATRIX MAKES VISIBLE
|
| Every existing helper sends to ONE named individual — the assigned person,
| the previous assignee, or the customer's relationship manager. There is no
| concept of notifying a role. That is why "Payment Verification Required"
| from the brief does not exist: the person who should receive it is whoever
| holds payments.verify, which is a role question, and nothing here could ask
| it. `recipient` below records which kind each event uses.
|
|------------------------------------------------------------------------------
*/

/** The filter groups on /admin/notifications. */
export type NotificationModule =
  | "leads"
  | "test_drives"
  | "reservations"
  | "enquiries"
  | "sales"
  | "offers"
  | "system";

export interface NotificationModuleSpec {
  id: NotificationModule;
  label: string;
  /**
   * False when nothing in the app sends this kind yet. The filter bar does
   * not offer an empty group — a filter that can only ever return nothing
   * reads as a broken feature rather than as an honest gap.
   */
  live: boolean;
  /** Shown on the preferences page when live is false. */
  gap?: string;
}

export const NOTIFICATION_MODULES: readonly NotificationModuleSpec[] = [
  { id: "leads", label: "Leads", live: true },
  { id: "test_drives", label: "Test drives", live: true },
  { id: "enquiries", label: "Enquiries", live: true },
  { id: "offers", label: "Offers & loyalty", live: true },
  {
    id: "sales",
    label: "Sales & payments",
    live: true,
    gap: "Only payment verification sends anything so far. Deal transitions and document issue send nothing yet.",
  },
  {
    id: "reservations",
    label: "Reservations",
    live: false,
    gap: "Nothing sends a reservation notification. A reservation approaching its expiry is the obvious one, and it needs the scheduler from Phase 20 plus a recipient rule — the salesperson who took it, most likely.",
  },
  {
    id: "system",
    label: "System",
    live: false,
    gap: "Nothing sends a system notification. The maintenance jobs log to maintenance_runs instead, which is the better place for them — a failed nightly sweep is not a message for one person's bell.",
  },
];

/**
 * Who a notification goes to.
 *
 *   assignee   the staff member the record is assigned to
 *   previous   the person it was just taken away from
 *   manager    the customer's relationship manager
 *   role       everyone holding a permission — only payment verification
 */
export type RecipientKind = "assignee" | "previous" | "manager" | "role";

export interface NotificationEvent {
  type: string;
  module: NotificationModule;
  /** Shown in the filter chips and on the preferences page. */
  label: string;
  /** When it fires. */
  trigger: string;
  recipient: RecipientKind;
  /** What recipient means for this event, in words. */
  recipientNote: string;
  /** What dedupe_key the helper passes, or how duplicates are avoided. */
  dedupe: string;
  /**
   * Mandatory events cannot be switched off by anyone. Sprint 10: "ordinary
   * staff must not be able to disable mandatory security or financial
   * notifications."
   *
   * Kept deliberately short. Marking everything mandatory would make the
   * preferences page pointless and would train people to ignore the bell,
   * which costs more than it protects.
   */
  mandatory: boolean;
  /** Why, when mandatory. */
  mandatoryReason?: string;
  /**
   * Derived from the event, not stored: does the recipient have to go and do
   * something, as opposed to being told something happened.
   */
  actionable: boolean;
  /** Which preference toggle governs it. Several events can share one. */
  preferenceKey: string;
}

export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  /* ------------------------------------------------------------------ leads */
  {
    type: "lead_assigned",
    module: "leads",
    label: "A lead is assigned to you",
    trigger: "A lead's assigned staff member is set or changed to you.",
    recipient: "assignee",
    recipientNote: "The person the lead is now assigned to.",
    dedupe: "None. Each assignment is a separate event worth telling someone about.",
    mandatory: false,
    actionable: true,
    preferenceKey: "lead_assignment",
  },
  {
    type: "lead_reassigned",
    module: "leads",
    label: "A lead is taken off you",
    trigger: "A lead you were assigned is reassigned to somebody else.",
    recipient: "previous",
    recipientNote: "The person who was assigned until now.",
    dedupe: "None.",
    mandatory: false,
    actionable: false,
    preferenceKey: "lead_assignment",
  },
  {
    type: "lead_stage_changed",
    module: "leads",
    label: "A lead of yours changes stage",
    trigger: "Somebody else moves a lead you are assigned to a different stage.",
    recipient: "assignee",
    recipientNote: "The assigned staff member.",
    dedupe: "None.",
    mandatory: false,
    actionable: false,
    preferenceKey: "lead_stage",
  },
  {
    type: "follow_up_due",
    module: "leads",
    label: "A follow-up is due",
    trigger: "A scheduled follow-up reaches its due time.",
    recipient: "assignee",
    recipientNote: "Whoever the follow-up is assigned to.",
    dedupe: "Keyed on the follow-up, so a job that runs twice does not send twice.",
    mandatory: false,
    actionable: true,
    preferenceKey: "lead_follow_up",
  },

  /* ------------------------------------------------------------ test drives */
  {
    type: "test_drive_reassigned",
    module: "test_drives",
    label: "A test drive changes host",
    trigger: "A test drive's host is changed.",
    recipient: "assignee",
    recipientNote: "The new host, and separately the previous one.",
    dedupe: "None.",
    mandatory: false,
    actionable: true,
    preferenceKey: "test_drive",
  },
  {
    type: "test_drive_rescheduled",
    module: "test_drives",
    label: "A test drive is moved",
    trigger: "A test drive's time changes.",
    recipient: "assignee",
    recipientNote:
      "The staff member hosting it. The customer is not told anything — there is no customer-facing channel.",
    dedupe: "None.",
    mandatory: false,
    actionable: true,
    preferenceKey: "test_drive",
  },

  /* -------------------------------------------------------------- enquiries */
  {
    type: "enquiry_received",
    module: "enquiries",
    label: "An enquiry comes in",
    trigger: "A new enquiry is created and assigned.",
    recipient: "assignee",
    recipientNote: "The assigned staff member.",
    dedupe: "Keyed on the enquiry.",
    mandatory: false,
    actionable: true,
    preferenceKey: "enquiry_assignment",
  },
  {
    type: "enquiry_reassigned",
    module: "enquiries",
    label: "An enquiry is reassigned",
    trigger: "An enquiry's assigned staff member changes.",
    recipient: "assignee",
    recipientNote: "The new assignee, and separately the previous one.",
    dedupe: "None.",
    mandatory: false,
    actionable: true,
    preferenceKey: "enquiry_assignment",
  },
  {
    type: "enquiry_status_changed",
    module: "enquiries",
    label: "An enquiry of yours changes status",
    trigger: "Somebody else moves an enquiry you are assigned.",
    recipient: "assignee",
    recipientNote: "The assigned staff member.",
    dedupe: "None.",
    mandatory: false,
    actionable: false,
    preferenceKey: "enquiry_status",
  },
  {
    type: "enquiry_urgent",
    module: "enquiries",
    label: "An enquiry is marked urgent",
    trigger: "An enquiry's priority is raised to urgent.",
    recipient: "assignee",
    recipientNote: "The assigned staff member.",
    dedupe: "Keyed on the enquiry, so raising priority twice does not send twice.",
    mandatory: false,
    actionable: true,
    preferenceKey: "enquiry_status",
  },

  /* ------------------------------------------------------- offers & loyalty */
  {
    type: "offer_assigned",
    module: "offers",
    label: "An offer is assigned to your customer",
    trigger: "A campaign is attached to a customer you manage.",
    recipient: "manager",
    recipientNote: "The customer's relationship manager.",
    dedupe: "Keyed on the customer and campaign.",
    mandatory: false,
    actionable: false,
    preferenceKey: "offer_activity",
  },
  {
    type: "offer_expiring",
    module: "offers",
    label: "An offer is about to expire",
    trigger: "A campaign nears its end date.",
    recipient: "manager",
    recipientNote: "The customer's relationship manager.",
    dedupe: "Keyed on the campaign and the day, so a daily job sends once.",
    mandatory: false,
    actionable: true,
    preferenceKey: "offer_activity",
  },
  {
    type: "points_earned",
    module: "offers",
    label: "Your customer earns points",
    trigger: "A deal credits loyalty points.",
    recipient: "manager",
    recipientNote: "The customer's relationship manager.",
    dedupe: "Keyed on the ledger entry.",
    mandatory: false,
    actionable: false,
    preferenceKey: "loyalty_activity",
  },
  {
    type: "points_redeemed",
    module: "offers",
    label: "Your customer spends points",
    trigger: "A redemption is committed against a deal.",
    recipient: "manager",
    recipientNote: "The customer's relationship manager.",
    dedupe: "Keyed on the redemption.",
    mandatory: false,
    actionable: false,
    preferenceKey: "loyalty_activity",
  },
  {
    type: "points_expiring",
    module: "offers",
    label: "Your customer's points are about to expire",
    trigger: "A customer's points near their expiry date.",
    recipient: "manager",
    recipientNote: "The customer's relationship manager.",
    dedupe: "Keyed on the customer and the day.",
    mandatory: false,
    actionable: true,
    preferenceKey: "loyalty_activity",
  },
  {
    type: "points_adjusted",
    module: "offers",
    label: "Someone adjusts a points balance by hand",
    trigger: "A staff member grants or removes points manually.",
    recipient: "manager",
    recipientNote: "The customer's relationship manager.",
    dedupe: "Keyed on the ledger entry.",
    mandatory: true,
    mandatoryReason:
      "Somebody changed a customer's balance by hand rather than through a sale. Whoever manages that customer should know it happened, and should not be able to stop finding out.",
    actionable: false,
    preferenceKey: "loyalty_adjustment",
  },

  /* ------------------------------------------------------ sales & payments */
  {
    type: "payment_verification_required",
    module: "sales",
    label: "A payment needs verifying",
    trigger:
      "A payment is recorded by someone who cannot verify it themselves, because the separate-verifier rule is on.",
    recipient: "role",
    recipientNote:
      "Everyone holding payments.verify, except the person who recorded it — they are the one who must not verify it.",
    dedupe: "Keyed on the payment, so re-saving it does not notify twice.",
    mandatory: true,
    mandatoryReason:
      "A recorded payment that nobody verifies is money the business believes it has. If this could be switched off, the separate-verifier rule would be a rule nobody hears about.",
    actionable: true,
    preferenceKey: "payment_verification",
  },
];

/** One toggle on the preferences page; several events can share it. */
export interface PreferenceGroup {
  key: string;
  label: string;
  description: string;
  module: NotificationModule;
  /** True when every event under it is mandatory. */
  mandatory: boolean;
  mandatoryReason?: string;
  types: readonly string[];
}

/** Built from the events, so a new event cannot be forgotten here. */
export function preferenceGroups(): readonly PreferenceGroup[] {
  const groups = new Map<string, PreferenceGroup>();

  NOTIFICATION_EVENTS.forEach((event) => {
    const existing = groups.get(event.preferenceKey);
    if (existing) {
      groups.set(event.preferenceKey, {
        ...existing,
        // A group is only mandatory if everything in it is. One optional
        // event under a mandatory toggle would be silently unswitchable.
        mandatory: existing.mandatory && event.mandatory,
        mandatoryReason: existing.mandatoryReason ?? event.mandatoryReason,
        types: [...existing.types, event.type],
      });
      return;
    }
    groups.set(event.preferenceKey, {
      key: event.preferenceKey,
      label: PREFERENCE_LABELS[event.preferenceKey] ?? event.label,
      description: PREFERENCE_DESCRIPTIONS[event.preferenceKey] ?? event.trigger,
      module: event.module,
      mandatory: event.mandatory,
      mandatoryReason: event.mandatoryReason,
      types: [event.type],
    });
  });

  return Array.from(groups.values());
}

const PREFERENCE_LABELS: Record<string, string> = {
  lead_assignment: "Lead assignments",
  lead_stage: "Lead stage changes",
  lead_follow_up: "Follow-ups due",
  test_drive: "Test drive changes",
  enquiry_assignment: "Enquiry assignments",
  enquiry_status: "Enquiry status and urgency",
  offer_activity: "Offer activity",
  loyalty_activity: "Loyalty activity",
  loyalty_adjustment: "Manual points adjustments",
  payment_verification: "Payments needing verification",
};

const PREFERENCE_DESCRIPTIONS: Record<string, string> = {
  lead_assignment: "When a lead is assigned to you, or taken off you.",
  lead_stage: "When somebody else moves a lead you are assigned.",
  lead_follow_up: "When a follow-up you scheduled falls due.",
  test_drive: "When a test drive you are hosting is moved or reassigned.",
  enquiry_assignment: "When an enquiry is assigned to you, or taken off you.",
  enquiry_status: "When an enquiry you are assigned changes status or is marked urgent.",
  offer_activity: "When a campaign is attached to one of your customers, or is about to end.",
  loyalty_activity: "When one of your customers earns, spends, or is about to lose points.",
  loyalty_adjustment: "When somebody changes one of your customers' balances by hand.",
  payment_verification: "When a payment is waiting for somebody else to verify it.",
};

export function findNotificationEvent(type: string): NotificationEvent | undefined {
  return NOTIFICATION_EVENTS.find((event) => event.type === type);
}

/**
 * Which filter group a notification belongs in.
 *
 * An unrecognised type goes to "system" rather than being hidden. A
 * notification nobody catalogued is still a notification somebody was sent,
 * and dropping it from every filter would make it unreachable while still
 * counting toward the unread badge.
 */
export function notificationModule(type: string): NotificationModule {
  return findNotificationEvent(type)?.module ?? "system";
}

export function isActionable(type: string): boolean {
  return findNotificationEvent(type)?.actionable ?? false;
}

export function isMandatory(type: string): boolean {
  return findNotificationEvent(type)?.mandatory ?? false;
}

/** The filter chips to offer: the live modules, plus any with notifications. */
export function filterableModules(presentTypes: readonly string[]): readonly NotificationModuleSpec[] {
  const present = new Set(presentTypes.map(notificationModule));
  return NOTIFICATION_MODULES.filter((module) => module.live || present.has(module.id));
}

/** The catalogued types in one module. */
export function typesForModule(module: NotificationModule): readonly string[] {
  return NOTIFICATION_EVENTS.filter((event) => event.module === module).map((event) => event.type);
}

/** Every type the catalog knows, for the catch-all filter below. */
export function allCataloguedTypes(): readonly string[] {
  return NOTIFICATION_EVENTS.map((event) => event.type);
}

/**
 * How to filter the feed for one module, as a database condition rather than
 * a list of types.
 *
 * "system" is the catch-all: notificationModule() sends any type the catalog
 * does not know there, so filtering it by a list of types would return
 * nothing and hide exactly the notifications that need looking at. It is
 * expressed as "not any of the types we do know" instead.
 *
 * Filtering in the database rather than after fetching matters for more than
 * speed: a client-side filter over one page of 25 would show an empty list
 * while later pages held matches, and "has more" would be computed from rows
 * that were then thrown away.
 */
export function moduleFilter(
  module: NotificationModule,
): { kind: "in"; types: readonly string[] } | { kind: "not_in"; types: readonly string[] } {
  const own = typesForModule(module);
  if (module === "system") {
    return { kind: "not_in", types: allCataloguedTypes().filter((type) => !own.includes(type)) };
  }
  return { kind: "in", types: own };
}
