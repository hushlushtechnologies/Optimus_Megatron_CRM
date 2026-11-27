/**
 * What a settings page shows when its values could not be read.
 *
 * Not an empty form, and not zeroes. A settings form rendered from
 * fall-back defaults is the worst outcome available here: it looks
 * authoritative, it shows values nobody set, and saving it would write
 * those values over the real ones. So a failed read gets a page with no
 * form on it at all.
 */
export function SettingsLoadError({ what = "These settings" }: { what?: string }) {
  return (
    <div role="alert" className="surface-card flex max-w-2xl flex-col gap-2 p-5">
      <p className="text-body-sm text-text-primary font-medium">{what} couldn&apos;t be loaded.</p>
      <p className="text-body-sm text-text-muted">
        Nothing has been lost or changed, and nothing on this page has been saved. Refresh to try again, and
        let someone know if it keeps happening.
      </p>
    </div>
  );
}
