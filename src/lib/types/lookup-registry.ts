/*
|------------------------------------------------------------------------------
| The editable lookup tables, described once
|------------------------------------------------------------------------------
|
| Phases 7, 8 and 11 ask for editors over roughly twenty lookup tables. Twenty
| bespoke editors would be twenty places to get "disable, never delete" wrong,
| so there is one editor driven by this list — the same approach as the
| settings registry from Batch 1.
|
| WHAT THESE TABLES HAVE IN COMMON
|
| Most of them share one shape, which the codebase already names LookupOption:
| `id, name, slug, is_active, sort_order`. The vehicle forms read them with
| `.eq("is_active", true).order("sort_order")`, so the schema was built for
| retiring values from the start — nothing needed adding.
|
| The Sprint 7 enquiry tables are the exception: they are keyed by a text
| `key` rather than a uuid, and they call the display column `label` rather
| than `name`. That is a better design for a vocabulary that code refers to by
| name, and it is why `keyColumn` and `labelColumn` are fields here rather than
| assumptions.
|
| NOTHING HERE CAN BE DELETED
|
| Every one of these is referenced by historical records: a car's fuel type, a
| lead's stage, an enquiry's source. The brief is explicit — "when disabling a
| value, preserve historical vehicles that use it", "do not break existing
| vehicle records" — and the way to honour that is that the editor has no
| delete. Switching a value off removes it from every picker and leaves every
| record that used it exactly as it is.
|
| `usedBy` on each entry is what a car, lead or enquiry loses if somebody gets
| that wrong, written out so it appears on the screen where the decision is
| made rather than only in this comment.
|
| WHAT IS NOT HERE, AND WHY
|
| Several things the phases list are not lookup tables at all, and inventing
| tables for them would be the "fake settings controls simply to fill every
| category" the brief rules out. They are listed in UNCONFIGURABLE below so
| the pages can say so rather than leaving a silent gap.
|
|------------------------------------------------------------------------------
*/

export type LookupGroup = "inventory" | "crm" | "enquiries";

export interface LookupFieldSpec {
  /** Column name. */
  column: string;
  label: string;
  kind: "text" | "longtext" | "color" | "choice";
  /** Only for kind "choice". */
  choices?: readonly { readonly value: string; readonly label: string }[];
  required?: boolean;
  maxLength?: number;
  help?: string;
}

export interface LookupTableSpec {
  /** Used in the URL and as a React key. */
  id: string;
  table: string;
  group: LookupGroup;
  /** Plural, as a heading. */
  label: string;
  /** Singular, for "Add a brand". */
  singular: string;
  description: string;

  /** Primary key column: uuid `id` everywhere except the Sprint 7 tables. */
  keyColumn: "id" | "key";
  /** Display column: `name` everywhere except the Sprint 7 tables. */
  labelColumn: "name" | "label";

  hasSortOrder: boolean;
  /**
   * `slug` is a stable machine name that code matches on — lead-queries finds
   * the "new" stage by slug. Editing one silently breaks that lookup, so the
   * editor shows it read-only on existing rows and never writes it.
   */
  hasSlug: boolean;

  /** Extra editable columns beyond the display name. */
  fields: readonly LookupFieldSpec[];

  /** For models (brand) and variants (model). */
  parent?: {
    column: string;
    table: string;
    label: string;
  };

  /** What historical records use this for. Shown on screen. */
  usedBy: string;

  /**
   * How much the editor allows.
   *
   *   "full"    add, rename, reorder, switch off
   *   "rename"  rename and reorder only — no adding, no switching off
   *
   * "rename" is for the tables the code reasons about. Three of them are
   * matched by `slug` or `key` rather than by name, so renaming the label is
   * safe and reordering is cosmetic — but ADDING one means code that has
   * never seen it must still decide what it means, and SWITCHING ONE OFF can
   * leave records stranded on a value with nowhere to go. Those two need a
   * migration that updates the dependent logic in the same change.
   *
   * Making these read-only instead would have been easier to defend and less
   * useful: renaming "Qualified" to "Contacted" is a reasonable thing to want
   * and breaks nothing.
   */
  mode: "full" | "rename";

  /** Required when mode is not "full". Shown on the screen, not just here. */
  restriction?: string;
}

/** The shape most of these tables share. */
const SORTABLE = { hasSortOrder: true, hasSlug: true } as const;

/** Add, rename, reorder, switch off. */
const FULL = { mode: "full" } as const;

export const LOOKUP_TABLES: readonly LookupTableSpec[] = [
  /* ------------------------------------------------------------ inventory */
  {
    id: "brands",
    table: "brands",
    group: "inventory",
    label: "Brands",
    singular: "brand",
    description: "The manufacturers you sell.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    usedBy: "Every vehicle's make, and the brand filter on inventory, leads, sales and test drives.",
    ...FULL,
  },
  {
    id: "models",
    table: "models",
    group: "inventory",
    label: "Models",
    singular: "model",
    description: "The models under each brand.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    parent: { column: "brand_id", table: "brands", label: "Brand" },
    usedBy: "Every vehicle's model. A vehicle keeps its model even if the model is switched off.",
    ...FULL,
  },
  {
    id: "variants",
    table: "variants",
    group: "inventory",
    label: "Variants",
    singular: "variant",
    description: "Trim levels under each model.",
    keyColumn: "id",
    labelColumn: "name",
    hasSortOrder: true,
    hasSlug: false,
    fields: [],
    parent: { column: "model_id", table: "models", label: "Model" },
    usedBy:
      "A vehicle's trim. Vehicles can also carry free-text trim instead, so not every vehicle uses this list.",
    ...FULL,
  },
  {
    id: "body-types",
    table: "body_types",
    group: "inventory",
    label: "Body types",
    singular: "body type",
    description: "Saloon, SUV, coupé and the rest.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    usedBy: "Every vehicle's body type, and the inventory filters.",
    ...FULL,
  },
  {
    id: "fuel-types",
    table: "fuel_types",
    group: "inventory",
    label: "Fuel types",
    singular: "fuel type",
    description: "Petrol, diesel, hybrid, electric.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    usedBy: "Every vehicle's fuel type, and the inventory filters.",
    ...FULL,
  },
  {
    id: "transmissions",
    table: "transmission_types",
    group: "inventory",
    label: "Transmissions",
    singular: "transmission",
    description: "Automatic, manual and the variations you list.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    usedBy: "Every vehicle's transmission, and the inventory filters.",
    ...FULL,
  },
  {
    id: "drive-types",
    table: "drive_types",
    group: "inventory",
    label: "Drive types",
    singular: "drive type",
    description: "Front, rear, all-wheel drive.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    usedBy: "Every vehicle's drivetrain.",
    ...FULL,
  },
  {
    id: "paint-finishes",
    table: "paint_finish_types",
    group: "inventory",
    label: "Paint finishes",
    singular: "paint finish",
    description: "Metallic, matte, pearlescent.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    usedBy:
      "A vehicle's paint finish. Colour names and their hex values are typed per vehicle, not chosen from a list.",
    ...FULL,
  },
  {
    id: "warranty-types",
    table: "warranty_types",
    group: "inventory",
    label: "Warranty types",
    singular: "warranty type",
    description: "The kinds of warranty you offer.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    usedBy: "A vehicle's warranty.",
    ...FULL,
  },
  {
    id: "collections",
    table: "collections",
    group: "inventory",
    label: "Collections",
    singular: "collection",
    description: "Groupings you use to merchandise vehicles together.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [
      {
        column: "description",
        label: "Description",
        kind: "longtext",
        maxLength: 300,
        help: "Shown where the collection is presented.",
      },
    ],
    usedBy: "Which collection a vehicle belongs to.",
    ...FULL,
  },
  {
    id: "vehicle-statuses",
    table: "vehicle_statuses",
    group: "inventory",
    label: "Vehicle statuses",
    singular: "status",
    description: "Availability and publishing states a vehicle can be in.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [
      {
        column: "category",
        label: "Kind",
        kind: "choice",
        required: true,
        choices: [
          { value: "availability", label: "Availability — is it for sale" },
          { value: "publishing", label: "Publishing — is it on the website" },
        ],
        help: "Availability and publishing are separate lists. A vehicle has one of each.",
      },
      { column: "color_hex", label: "Badge colour", kind: "color" },
    ],
    usedBy: "Every vehicle's availability and publishing state, the inventory board, and the Sprint 9 inventory report.",
    mode: "rename",
    restriction:
      "Rename and reorder only. Code matches these by slug, not by name, so renaming a label is safe — but adding a status means code that has never heard of it must still decide whether a vehicle on it is sellable and whether it belongs on the website, and switching one off can strand vehicles on a state with nowhere to go. Both need a migration alongside.",
  },

  /* ---------------------------------------------------------------- crm */
  {
    id: "customer-sources",
    table: "customer_sources",
    group: "crm",
    label: "Customer sources",
    singular: "source",
    description: "How a customer or lead first reached you.",
    keyColumn: "id",
    labelColumn: "name",
    hasSortOrder: true,
    hasSlug: false,
    fields: [
      {
        column: "requires_detail",
        label: "Needs a note",
        kind: "choice",
        choices: [
          { value: "false", label: "No extra detail needed" },
          { value: "true", label: "Ask for a detail — e.g. who referred them" },
        ],
        help: "When on, staff are asked to type a detail alongside the source.",
      },
    ],
    usedBy:
      "Every customer's and lead's source, the source filters, and the source breakdown in the Sprint 9 reports.",
    ...FULL,
  },
  {
    id: "customer-tags",
    table: "customer_tags",
    group: "crm",
    label: "Customer tags",
    singular: "tag",
    description: "Labels you put on customers.",
    keyColumn: "id",
    labelColumn: "name",
    hasSortOrder: true,
    hasSlug: false,
    fields: [{ column: "color_hex", label: "Colour", kind: "color" }],
    usedBy: "Tags already on customers. Switching one off stops it being added to anybody new.",
    ...FULL,
  },
  {
    id: "lead-stages",
    table: "lead_stages",
    group: "crm",
    label: "Lead stages",
    singular: "stage",
    description: "The pipeline a lead moves through.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [
      {
        column: "stage_type",
        label: "Counts as",
        kind: "choice",
        required: true,
        choices: [
          { value: "open", label: "Open — still being worked" },
          { value: "won", label: "Won — converted" },
          { value: "lost", label: "Lost — no longer in play" },
        ],
        help: "This is what the dashboard and the reports count the lead as. It is not cosmetic.",
      },
      { column: "color_hex", label: "Colour", kind: "color" },
    ],
    usedBy:
      "Every lead's position in the pipeline, the kanban board, the conversion figures on the dashboard, and the Sprint 9 lead report.",
    mode: "rename",
    restriction:
      "Rename and reorder only, and the type stays fixed. Stages are found by slug — the \"new\" stage a lead starts in is one — so renaming a label is safe. What is not safe is stage_type: the won, lost and open totals on the dashboard and in the Sprint 9 lead report are computed from it, so changing one moves leads between won and lost everywhere at once with nothing to flag it. Adding a stage needs the slug lookups updated in the same change.",
  },
  {
    id: "lead-tags",
    table: "lead_tags",
    group: "crm",
    label: "Lead tags",
    singular: "tag",
    description: "Labels you put on leads.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [{ column: "color_hex", label: "Colour", kind: "color" }],
    usedBy: "Tags already on leads. Switching one off stops it being added to anybody new.",
    ...FULL,
  },
  {
    id: "lost-reasons",
    table: "lead_lost_reasons",
    group: "crm",
    label: "Lost reasons",
    singular: "reason",
    description: "Why a lead didn't convert.",
    keyColumn: "id",
    labelColumn: "name",
    ...SORTABLE,
    fields: [],
    usedBy:
      "The reason recorded against every lost lead, and the lost-reason breakdown in the Sprint 9 lead report.",
    ...FULL,
  },
  {
    id: "follow-up-actions",
    table: "lead_future_actions",
    group: "crm",
    label: "Follow-up actions",
    singular: "action",
    description: "What staff plan to do next with a lead.",
    keyColumn: "id",
    labelColumn: "label",
    hasSortOrder: true,
    hasSlug: false,
    fields: [
      {
        column: "description",
        label: "Description",
        kind: "longtext",
        maxLength: 200,
        help: "Shown under the action when it is chosen.",
      },
    ],
    usedBy: "The next action recorded on a lead.",
    ...FULL,
  },

  /* ----------------------------------------------------------- enquiries */
  {
    id: "enquiry-types",
    table: "enquiry_types",
    group: "enquiries",
    label: "Enquiry types",
    singular: "type",
    description: "The kinds of enquiry you handle.",
    keyColumn: "key",
    labelColumn: "label",
    hasSortOrder: true,
    hasSlug: false,
    fields: [
      {
        column: "description",
        label: "Description",
        kind: "longtext",
        maxLength: 300,
        help: "Shown to staff when they pick the type.",
      },
    ],
    usedBy: "Every enquiry's type, and which status transitions are allowed for it.",
    mode: "rename",
    restriction:
      "Rename and reorder only. enquiry_status_transitions lists which status may follow which PER TYPE, so a type added here would arrive with no transitions and an enquiry on it could not be moved anywhere at all. Adding one means adding its transitions in the same change.",
  },
  {
    id: "enquiry-sources",
    table: "enquiry_sources",
    group: "enquiries",
    label: "Enquiry sources",
    singular: "source",
    description: "Where an enquiry came from.",
    keyColumn: "key",
    labelColumn: "label",
    hasSortOrder: true,
    hasSlug: false,
    fields: [],
    usedBy: "Every enquiry's source, and the source breakdown in the enquiry reports.",
    ...FULL,
  },
  {
    id: "enquiry-statuses",
    table: "enquiry_statuses",
    group: "enquiries",
    label: "Enquiry statuses",
    singular: "status",
    description: "The states an enquiry moves through.",
    keyColumn: "key",
    labelColumn: "label",
    hasSortOrder: true,
    hasSlug: false,
    fields: [],
    usedBy: "Every enquiry's status, the workflow that decides what may follow what, and the enquiry reports.",
    mode: "rename",
    restriction:
      "Rename and reorder only. The Sprint 7 workflow is a graph: enquiry_status_transitions says which status may follow which, and is_open and is_terminal decide whether an enquiry counts as live or finished. A status added here would have no transitions into or out of it, and one switched off could leave enquiries stranded with nowhere to go. The graph has to change with it.",
  },
];

/**
 * Things the phases list that are not lookup tables.
 *
 * Each of these is a fixed set in the database — a TypeScript union backed by
 * a check constraint — or does not exist at all. The pages say so, because a
 * silent gap reads as an oversight and an invented table would be a control
 * that does nothing.
 */
export const UNCONFIGURABLE: readonly {
  readonly group: LookupGroup;
  readonly label: string;
  readonly reason: string;
}[] = [
  {
    group: "inventory",
    label: "Vehicle conditions",
    reason:
      "Brand New, Excellent, Very Good, Good and Fair are a fixed set in the database, not a table. Changing them is a migration, and every vehicle already recorded would need remapping.",
  },
  {
    group: "inventory",
    label: "Regional specs",
    reason: "GCC, European, American, Japanese and Other are a fixed set in the database, same as conditions.",
  },
  {
    group: "inventory",
    label: "Colours",
    reason:
      "Colour names and hex values are typed per vehicle rather than chosen from a list, so there is nothing to edit. Paint finishes are a list, and they are above. Turning colours into a lookup would need a migration plus a pass over existing vehicles to map the free text onto it.",
  },
  {
    group: "inventory",
    label: "Inspection lookups",
    reason: "There are no inspection tables in the database. There is nothing to configure until the feature exists.",
  },
  {
    group: "crm",
    label: "Customer statuses",
    reason: "Customer status is derived from a customer's activity rather than stored as a choice, so there is no list behind it.",
  },
  {
    group: "crm",
    label: "Preferred languages",
    reason: "Not stored on customers. Adding it would be a migration and a form change, not a settings edit.",
  },
  {
    group: "crm",
    label: "Relationship managers",
    reason:
      "Who can be assigned a customer comes from your staff and their roles, not from a list of options. Manage it where staff and roles are managed.",
  },
  {
    group: "crm",
    label: "Follow-up types",
    reason:
      "Phone Call, WhatsApp, Email, Showroom Visit, Test Drive and General Follow-Up are a fixed set in the database. Follow-up ACTIONS are a table, and they are above.",
  },
  {
    group: "enquiries",
    label: "Priorities",
    reason: "Enquiry priority is a fixed set in the database rather than a table.",
  },
  {
    group: "enquiries",
    label: "Follow-up and assignment defaults",
    reason:
      "There is nowhere to store a default yet — no column on the enquiry tables holds one. A control here would have nothing to write to.",
  },
  {
    group: "enquiries",
    label: "Valuation workflow rules",
    reason:
      "The valuation flow is built into the Sprint 7 status graph rather than driven by settings. Making it configurable means making the graph configurable.",
  },
];

export function lookupTablesFor(group: LookupGroup): readonly LookupTableSpec[] {
  return LOOKUP_TABLES.filter((spec) => spec.group === group);
}

export function unconfigurableFor(group: LookupGroup): readonly { label: string; reason: string }[] {
  return UNCONFIGURABLE.filter((item) => item.group === group);
}

export function findLookupTable(id: string): LookupTableSpec | undefined {
  return LOOKUP_TABLES.find((spec) => spec.id === id);
}

/** Tables where a value can be added and switched off, not just renamed. */
export function fullyEditableLookupTables(): readonly LookupTableSpec[] {
  return LOOKUP_TABLES.filter((spec) => spec.mode === "full");
}
