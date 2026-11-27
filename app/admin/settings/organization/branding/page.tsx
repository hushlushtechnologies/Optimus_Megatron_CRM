import Image from "next/image";
import Link from "next/link";
import { FileImage, PanelLeft, TriangleAlert } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";

export const metadata = {
  title: "Branding & identity · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| BRANDING & IDENTITY — PHASE 5
|--------------------------------------------------------------------------
|
| Phase 5: "If branding is currently static, identify which values can
| safely become configurable."
|
| It is static, and the honest answer is "none of it yet, and here is
| exactly why" — so this page answers the question instead of pretending
| to be a form. There is no logo column on company_profile, no storage
| bucket, and no upload path. An upload control here would accept a file
| and lose it.
|
| The four brand files, and what each one actually feeds:
|
|   public/logo/main-logo.svg   sidebar, expanded
|   public/logo/mark-logo.svg   sidebar, collapsed
|   public/logo.png             EVERY generated PDF and Excel file
|   public/logo.svg             nothing — byte-identical to mark-logo.svg
|
| Two things in that list are worth somebody's attention.
|
| The PNG. Documents embed a raster image because jsPDF and ExcelJS
| cannot embed an SVG. So the logo on a quotation is a different file from
| the logo in the sidebar, in a different format, and replacing the SVG
| changes the screen while every document carries on using the old mark.
| Anybody updating the logo needs to replace both.
|
| The unused copy. public/logo.svg is a byte-for-byte duplicate of
| mark-logo.svg and nothing in the app references it. It is the file
| someone would most plausibly replace while trying to change the logo,
| and replacing it would do nothing at all.
|
| Which values CAN safely become configurable: the text on documents —
| legal name, trading name, address, tax registration number, bank
| details, invoice notes, quotation terms — and those already are, on the
| Company profile page. That is the configurable half of branding, and it
| is built.
*/

const DOCUMENT_LOGO = "/logo.png";
const SIDEBAR_LOGO = "/logo/main-logo.svg";
const SIDEBAR_MARK = "/logo/mark-logo.svg";

function Asset({
  label,
  path,
  usedBy,
  note,
}: {
  label: string;
  path: string;
  usedBy: string;
  note?: string;
}) {
  return (
    <div className="border-border flex flex-col gap-2 rounded-md border px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body-sm text-text-primary font-medium">{label}</p>
        <code className="text-caption text-text-subtle">{path}</code>
      </div>
      <p className="text-caption text-text-muted">{usedBy}</p>
      {note && <p className="text-caption text-text-muted">{note}</p>}
    </div>
  );
}

export default async function BrandingSettingsPage() {
  const page = findSettingsPage("branding");
  if (!page) throw new Error("Settings registry is missing the 'branding' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote="Logos are files in the project, not settings. Changing one is a deployment rather than a save, and this page says which file does what."
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="The logo on your documents"
          icon={FileImage}
          description="What appears at the top of every quotation, invoice, receipt and export."
          effect="A document already issued keeps the logo it was issued with. Replacing the file changes documents generated from then on."
        >
          <div className="border-border bg-card-hover/40 flex flex-wrap items-center gap-4 rounded-md border p-4">
            <Image
              src={DOCUMENT_LOGO}
              alt="The logo as it appears on generated documents"
              width={156}
              height={102}
              className="h-auto w-[156px]"
            />
            <p className="text-body-sm text-text-muted min-w-[12rem] flex-1">
              520 × 340, PNG. Documents have to use a raster image — the libraries that build the PDF and
              Excel files cannot draw an SVG — so this is a separate file from the one in the sidebar, and
              replacing the sidebar logo does not change this one.
            </p>
          </div>

          <p
            role="note"
            className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              If the file is missing, documents are generated without a logo rather than failing. That is
              the safer behaviour, but it is also quiet — a document can go out unbranded and nothing
              reports it.
            </span>
          </p>
        </SettingsSection>

        <SettingsSection
          title="The logo in the app"
          icon={PanelLeft}
          description="What staff see in the sidebar."
        >
          <div className="border-border bg-card-hover/40 flex flex-wrap items-center gap-6 rounded-md border p-4">
            <Image
              src={SIDEBAR_LOGO}
              alt="The full logo, as shown in the expanded sidebar"
              width={150}
              height={40}
              className="h-10 w-auto"
            />
            <Image
              src={SIDEBAR_MARK}
              alt="The logo mark, as shown in the collapsed sidebar"
              width={40}
              height={40}
              className="h-10 w-auto"
            />
          </div>

          <Asset
            label="Full logo"
            path="public/logo/main-logo.svg"
            usedBy="The sidebar, when it is expanded."
          />
          <Asset
            label="Logo mark"
            path="public/logo/mark-logo.svg"
            usedBy="The sidebar, when it is collapsed."
          />
          <Asset
            label="Document logo"
            path="public/logo.png"
            usedBy="Every generated PDF and Excel file."
            note="Must stay a PNG."
          />
          <Asset
            label="Unused copy"
            path="public/logo.svg"
            usedBy="Nothing references this file."
            note="Byte-identical to mark-logo.svg. It is the file someone would most likely replace when changing the logo, and replacing it would have no effect anywhere. Worth deleting so it cannot mislead."
          />
        </SettingsSection>

        <SettingsSection
          title="What could become a setting"
          description="The honest answer to whether branding can be made configurable."
        >
          <p className="text-body-sm text-text-muted">
            The text on your documents already is a setting — legal name, trading name, address, tax
            registration number, bank details, invoice notes and quotation terms are all on{" "}
            <Link
              href="/admin/settings/organization/company"
              className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              Company profile
            </Link>
            .
          </p>
          <p className="text-body-sm text-text-muted">
            Uploading a logo is not a setting yet, and making it one is more than a field. It needs a
            storage bucket to hold the file, a column to remember which file is current, and a conversion
            step so documents still get a PNG of the right size. An upload box without those would accept
            your file and quietly keep using the old logo — which is worse than this page.
          </p>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}
