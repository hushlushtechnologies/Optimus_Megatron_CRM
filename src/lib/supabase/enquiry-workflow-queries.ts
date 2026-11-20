import "server-only";

import { cache } from "react";

import { createClient } from "@/src/lib/supabase/server";
import {
  ENQUIRY_SOURCES,
  ENQUIRY_STATUS_TONES,
  ENQUIRY_STATUSES,
  ENQUIRY_TYPES,
  OPEN_ENQUIRY_STATUSES,
} from "@/src/lib/types/enquiry";
import type {
  EnquirySourceOption,
  EnquiryStatusOption,
  EnquiryTransition,
  EnquiryTypeOption,
  EnquiryWorkflow,
} from "@/src/lib/types/enquiry-workflow";

/* =========================================================
   FALLBACK
========================================================= */

/**
 * What to show when the lookup tables can't be read.
 *
 * Built from the compile-time constants, which are the values the migration
 * seeds. An enquiry screen with no statuses at all is useless, so a stale
 * list beats an empty one — and workflow.loaded is false so the screen can
 * say the configured list wasn't available.
 */
function fallbackWorkflow(): EnquiryWorkflow {
  const open = new Set<string>(OPEN_ENQUIRY_STATUSES);

  return {
    types: ENQUIRY_TYPES.map((key, index) => ({
      key,
      label: key,
      description: null,
      sortOrder: (index + 1) * 10,
      isActive: true,
    })),
    sources: ENQUIRY_SOURCES.map((key, index) => ({
      key,
      label: key,
      sortOrder: (index + 1) * 10,
      isActive: true,
    })),
    statuses: ENQUIRY_STATUSES.map((key, index) => ({
      key,
      label: key,
      tone: ENQUIRY_STATUS_TONES[key],
      isOpen: open.has(key),
      isTerminal: !open.has(key),
      sortOrder: (index + 1) * 10,
      isActive: true,
    })),
    // No transitions means the workflow layer allows nothing but refuses
    // loudly, rather than quietly permitting every move.
    transitions: [],
    loaded: false,
  };
}

/* =========================================================
   LOAD
========================================================= */

/**
 * The whole enquiry vocabulary, in one round of queries.
 *
 * Wrapped in React's cache so a page that needs it in three places — the
 * filter bar, the status control and a server action's validation — reads it
 * once per request rather than three times.
 */
export const getEnquiryWorkflow = cache(async (): Promise<EnquiryWorkflow> => {
  const supabase = await createClient();

  const [typesRes, sourcesRes, statusesRes, transitionsRes] = await Promise.all([
    supabase
      .from("enquiry_types")
      .select("key, label, description, sort_order, is_active")
      .order("sort_order"),
    supabase.from("enquiry_sources").select("key, label, sort_order, is_active").order("sort_order"),
    supabase
      .from("enquiry_statuses")
      .select("key, label, tone, is_open, is_terminal, sort_order, is_active")
      .order("sort_order"),
    supabase.from("enquiry_status_transitions").select("from_status, to_status, enquiry_type"),
  ]);

  const failed = [typesRes, sourcesRes, statusesRes, transitionsRes].find((item) => item.error);

  if (failed?.error) {
    console.error("getEnquiryWorkflow error:", failed.error);
    return fallbackWorkflow();
  }

  type TypeRow = {
    key: string;
    label: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  };
  type SourceRow = { key: string; label: string; sort_order: number; is_active: boolean };
  type StatusRow = {
    key: string;
    label: string;
    tone: EnquiryStatusOption["tone"];
    is_open: boolean;
    is_terminal: boolean;
    sort_order: number;
    is_active: boolean;
  };
  type TransitionRow = { from_status: string; to_status: string; enquiry_type: string | null };

  const types: EnquiryTypeOption[] = ((typesRes.data ?? []) as TypeRow[]).map((row) => ({
    key: row.key,
    label: row.label,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));

  const sources: EnquirySourceOption[] = ((sourcesRes.data ?? []) as SourceRow[]).map((row) => ({
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));

  const statuses: EnquiryStatusOption[] = ((statusesRes.data ?? []) as StatusRow[]).map((row) => ({
    key: row.key,
    label: row.label,
    tone: row.tone,
    isOpen: row.is_open,
    isTerminal: row.is_terminal,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));

  const transitions: EnquiryTransition[] = ((transitionsRes.data ?? []) as TransitionRow[]).map((row) => ({
    fromStatus: row.from_status,
    toStatus: row.to_status,
    enquiryType: row.enquiry_type,
  }));

  /*
   * An empty statuses table means the Phase 1 migration hasn't run. Falling
   * back is kinder than a screen with no status control on it at all.
   */
  if (statuses.length === 0) {
    console.error("getEnquiryWorkflow: enquiry_statuses is empty. Has the migration run?");
    return fallbackWorkflow();
  }

  return { types, sources, statuses, transitions, loaded: true };
});
