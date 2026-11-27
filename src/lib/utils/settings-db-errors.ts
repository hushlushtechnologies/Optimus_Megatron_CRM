/**
 * Telling "that column was never added" apart from every other failure.
 *
 * The showrooms page asks for `locations.address` first and falls back to a
 * narrower query when the column is missing, because `locations` predates
 * every migration in this repo and no query in the app has ever read an
 * address from it.
 *
 * This predicate has to be narrow, and it lives in its own file so it can be
 * tested without pulling in a Supabase client. Treating any failure as a
 * missing column would turn a permission error, a dropped connection or a
 * typo into a page that quietly hides a field and looks like it worked. The
 * fallback is for one specific, knowable condition: Postgres error 42703.
 */
export function isUndefinedColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;

  // PostgREST does not always pass the code through. The message test needs
  // both halves: "column ... does not exist" and nothing looser, so that
  // "relation does not exist" (a missing TABLE, which is a real problem) and
  // "function ... does not exist" do not match.
  const message = (error.message ?? "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}
