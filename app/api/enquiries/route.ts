import { createHash } from "crypto";
import { after, NextRequest, NextResponse } from "next/server";

import { ENQUIRY_MIN_FILL_SECONDS } from "@/src/lib/constants/enquiries";
import { createClient } from "@/src/lib/supabase/server";
import { notifyEnquiryReceivedByNumber } from "@/src/lib/notifications/enquiry-notifications";
import { publicEnquirySchema } from "@/src/lib/validation/enquiry";

/*
|--------------------------------------------------------------------------
| PUBLIC ENQUIRY INTAKE
|--------------------------------------------------------------------------
|
| POST /api/enquiries — the endpoint the public website posts its contact,
| vehicle and finance forms to. No session, no API key.
|
| What keeps it safe is that it can't do much: it calls submit_enquiry(),
| a security-definer function that accepts contact details and a message and
| nothing else. Status, assignment, customer and lead are not parameters, so
| a crafted request can't create a converted enquiry or assign work to
| someone. Rate limiting lives in that function too, because this route runs
| on serverless functions with no memory shared between requests.
|
| Environment:
|   ENQUIRY_ALLOWED_ORIGINS  comma-separated origins allowed to post
|                            cross-origin, e.g. https://optimusmegatron.ae
|   ENQUIRY_IP_SALT          secret used to hash submitter IPs
*/

export const dynamic = "force-dynamic";

/* =========================================================
   CORS
========================================================= */

function allowedOrigins(): string[] {
  return (process.env.ENQUIRY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * CORS headers for this request, or none.
 *
 * An origin is echoed back only when it is on the list — never "*", because
 * this endpoint writes. A request with no Origin header (a server-to-server
 * post, or curl) needs no CORS at all and gets none.
 */
function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};

  const normalized = origin.replace(/\/$/, "");
  if (!allowedOrigins().includes(normalized)) return {};

  return {
    "Access-Control-Allow-Origin": normalized,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, request: NextRequest) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...corsHeaders(request) },
  });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/* =========================================================
   IP HASH
========================================================= */

/**
 * A salted hash of the submitter's address, or null.
 *
 * The address itself is never stored. The hash is enough to notice ten
 * submissions in an hour from one place, and not enough to work backwards to
 * a person. Without a configured salt the hash would be guessable from a
 * list of IPs, so in that case nothing is stored at all — which costs the
 * per-address rate limit, and the route says so in the log once.
 */
function hashIp(request: NextRequest): string | null {
  const salt = process.env.ENQUIRY_IP_SALT;

  if (!salt) {
    console.warn("ENQUIRY_IP_SALT is not set, so enquiry submissions are not rate limited per address.");
    return null;
  }

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";

  if (!ip) return null;

  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/* =========================================================
   SPAM SIGNALS
========================================================= */

/**
 * Whether this submission looks automated.
 *
 * None of these refuse the request. A refusal tells whoever is probing which
 * signal they tripped, and it throws away a real enquiry on the rare false
 * positive. The enquiry is saved with status Spam instead: out of the work
 * queue, visible on its own tab, and one click from being recovered.
 */
function looksAutomated(input: {
  company: string;
  elapsedMs?: number;
  message: string;
  fullName: string;
}): boolean {
  // The honeypot: a field no person can see, so no person fills it in.
  if (input.company.trim() !== "") return true;

  // Submitted faster than a person can type a name and a message.
  if (input.elapsedMs !== undefined && input.elapsedMs < ENQUIRY_MIN_FILL_SECONDS * 1000) return true;

  // Link stuffing: the signature of a comment spammer rather than a buyer.
  const links = input.message.match(/https?:\/\//gi)?.length ?? 0;
  if (links >= 3) return true;

  // BBCode or raw HTML anchors never come from a browser form.
  if (/\[url=|<a\s+href=/i.test(input.message)) return true;

  // A name that is itself a URL.
  if (/https?:\/\//i.test(input.fullName)) return true;

  return false;
}

/* =========================================================
   POST
========================================================= */

export async function POST(request: NextRequest) {
  /* ---- Body ---- */

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a JSON body." }, 400, request);
  }

  const parsed = publicEnquirySchema.safeParse(body);

  if (!parsed.success) {
    /*
     * Field-level messages go back, because this is a form a person is
     * looking at and "invalid request" helps nobody fix their email address.
     */
    const fields: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = issue.message;
    }

    return json({ error: "Please check the form and try again.", fields }, 422, request);
  }

  const v = parsed.data;

  const spam = looksAutomated({
    company: v.company,
    elapsedMs: v.elapsedMs,
    message: v.message,
    fullName: v.fullName,
  });

  /* ---- Save ---- */

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("submit_enquiry", {
    p_full_name: v.fullName,
    p_email: v.email === "" ? null : v.email.toLowerCase(),
    p_phone: v.phone === "" ? null : v.phone,
    p_message: v.message === "" ? null : v.message,
    p_enquiry_type: v.enquiryType,
    p_source: "Website",
    p_car_id: v.carId ?? null,
    p_vehicle_text: v.vehicleText === "" ? null : v.vehicleText,
    p_preferred_contact: v.preferredContact ?? null,
    p_page_url: v.pageUrl === "" ? null : v.pageUrl,
    p_utm_source: v.utmSource === "" ? null : v.utmSource,
    p_utm_medium: v.utmMedium === "" ? null : v.utmMedium,
    p_utm_campaign: v.utmCampaign === "" ? null : v.utmCampaign,
    p_ip_hash: hashIp(request),
    p_user_agent: request.headers.get("user-agent"),
    p_mark_spam: spam,
  });

  if (error) {
    // 53400 is the rate limit raised inside submit_enquiry.
    if (error.code === "53400") {
      return json(
        { error: "We have had several messages from you already. Please try again a little later." },
        429,
        request,
      );
    }

    // 23514 is a check violation: a missing name, or no way to reply.
    if (error.code === "23514") {
      return json({ error: "Please give us a name and a way to reply." }, 422, request);
    }

    console.error("Enquiry intake error:", error);

    return json({ error: "We couldn't save your message. Please try again." }, 500, request);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { enquiry_number: string; duplicate: boolean } | null | undefined;

  /*
   * Telling the team happens after the response has gone, so a visitor
   * never waits on our internal fan-out — and a notification problem can
   * never turn a saved enquiry into an error on their screen.
   *
   * Not for a duplicate: it is the same person sending the same thing
   * twice, and the first one was already announced.
   */
  if (row?.enquiry_number && !row.duplicate) {
    const reference = row.enquiry_number;
    after(() => notifyEnquiryReceivedByNumber(reference));
  }

  /*
   * The reply is the same whatever we concluded. Someone probing the form
   * learns nothing about the honeypot or the timing check, and a real person
   * caught by one of them still sees their message was received — it is, and
   * a colleague will find it on the Spam tab.
   */
  return json(
    {
      ok: true,
      reference: row?.enquiry_number ?? null,
      duplicate: row?.duplicate ?? false,
      message: "Thank you. Our team will be in touch shortly.",
    },
    201,
    request,
  );
}

/* =========================================================
   EVERYTHING ELSE
========================================================= */

export async function GET(request: NextRequest) {
  return json({ error: "Send enquiries with POST." }, 405, request);
}
