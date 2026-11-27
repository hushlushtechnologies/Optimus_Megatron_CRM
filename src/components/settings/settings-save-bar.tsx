"use client";

import { useCallback, useEffect } from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/src/components/ui/button";

/*
|--------------------------------------------------------------------------
| THE SAVE BAR, AND NOT LOSING WORK
|--------------------------------------------------------------------------
|
| Appears only when something has changed, pinned to the bottom of the
| viewport so it is reachable from a long form without scrolling back up.
|
| THREE WAYS TO LOSE UNSAVED SETTINGS, AND WHAT STOPS EACH
|
| 1. Closing the tab or reloading. `beforeunload` is the only hook the
|    browser gives for this, and it only works if a listener is registered
|    at the moment it fires — hence the effect below rather than a check
|    inside the handler.
|
| 2. Clicking a link to another page. Next's client router does not fire
|    beforeunload, so the capture-phase click listener below intercepts
|    in-app anchors and confirms first. Capture phase matters: by the time a
|    bubbled listener runs, Next has already begun the transition.
|
| 3. Using the browser's back button. Covered by the popstate listener.
|
| All three are behind `dirty`, so a page nobody has touched behaves
| normally and never prompts.
|
| WHY A NATIVE CONFIRM
|
| A custom modal would look better and would not work here: the click has to
| be cancelled synchronously, before Next starts the transition, and a React
| modal cannot answer in that window. `confirm` is the honest choice for the
| one case where the browser's timing wins over ours.
*/

interface SettingsSaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  /** Disables saving with a reason — usually a validation message. */
  blockedReason?: string;
  /** Replaces "Save changes" where a clearer verb helps. */
  saveLabel?: string;
}

const WARNING =
  "You have unsaved settings. Leave this page and your changes will be lost.";

export function SettingsSaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  blockedReason,
  saveLabel = "Save changes",
}: SettingsSaveBarProps) {
  /* No ref for `dirty`.
   *
   * An earlier version kept one, on the theory that the listeners below are
   * registered once and would otherwise close over a stale value. They are
   * not registered once — the effect lists `dirty` as a dependency and
   * returns early when it is false, so the listeners are torn down and
   * re-attached every time it flips, and the value they close over is always
   * current. The ref was dead weight, and writing to it during render is
   * exactly what react-hooks/refs warns about: under a double render it is
   * a side effect in a place that is supposed to be pure.
   *
   * It also means the handlers below do not need to re-check `dirty`: they
   * only exist while it is true. React runs effect cleanup during commit,
   * before the browser dispatches further events, so there is no window
   * where a listener outlives the state that justified it. */

  const confirmLeave = useCallback(() => window.confirm(WARNING), []);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      /* Browsers ignore custom text now and show their own, but the
         assignment is still what marks the event as needing a prompt. */
      event.returnValue = WARNING;
      return WARNING;
    };

    const onClick = (event: MouseEvent) => {
      /* Let modified clicks through — they open a new tab and lose nothing. */
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== 0) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target === "_blank") return;
      /* Only in-app navigation; an external link leaves the SPA and
         beforeunload covers it. */
      if (!href.startsWith("/")) return;

      if (!confirmLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onPopState = () => {
      if (!confirmLeave()) {
        /* Undo the pop by pushing the current entry back. Imperfect — the
           browser has already moved — but it keeps the person on the page
           with their edits intact, which is the point. */
        history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [dirty, confirmLeave]);

  if (!dirty) return null;

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="border-border bg-card/95 sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <p className="text-body-sm text-text-muted" aria-live="polite">
        {blockedReason ?? "You have unsaved changes."}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={saving}
          leftIcon={<RotateCcw className="size-3.5" aria-hidden="true" />}
        >
          Discard
        </Button>

        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || Boolean(blockedReason)}
          leftIcon={
            saving ? (
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : undefined
          }
        >
          {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}
