/**
 * Shapes shared between the settings pages and the pure functions that decide
 * what a change means.
 *
 * These live apart from the components so that settings-risk.ts — which is
 * plain functions with no React in it, and is imported by tests — never has to
 * reach into a "use client" module for a type.
 */

export type ChangeDirection = "loosens" | "tightens" | "changes";

export interface SettingsChangePreview {
  /** The field, as the form labels it. */
  label: string;
  /** Display value before, already formatted (e.g. "5%", "On"). */
  before: string;
  /** Display value after, already formatted. */
  after: string;
  /** What the change does, in terms of deals and people rather than columns. */
  effect: string;
  direction: ChangeDirection;
}
