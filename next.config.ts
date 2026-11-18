import type { NextConfig } from "next";

/*
 * The Supabase Storage host, derived from the public URL so it never has to be
 * written twice. Images are served from <project>.supabase.co/storage/v1/...
 *
 * next/image refuses any remote host that isn't listed here, so without this
 * no vehicle photo could be rendered through <Image />.
 */
function supabaseImageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const supabaseHost = supabaseImageHost();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },

  /*
   * Export routes read the logo off the file system at request time, so the
   * asset has to be traced into the serverless bundle or it is missing in
   * production.
   *
   * Paths are relative to the project root, which is why the previous
   * "./logo/main-logo.svg" never resolved: the file is at public/logo/.
   *
   * ExcelJS and jsPDF can only embed raster images, so the generators look for
   * public/logo.png. Add that PNG and every export carries the mark; without
   * it they still generate, just unbranded.
   */
  outputFileTracingIncludes: {
    "/admin/inventory/export": ["./public/logo.png", "./public/logo/main-logo.svg"],
    "/admin/leads/export": ["./public/logo.png", "./public/logo/main-logo.svg"],
    "/admin/customers/export": ["./public/logo.png", "./public/logo/main-logo.svg"],
    "/admin/test-drives/export": ["./public/logo.png", "./public/logo/main-logo.svg"],
    "/admin/sales/export": ["./public/logo.png", "./public/logo/main-logo.svg"],
    "/admin/sales/documents/[id]/pdf": ["./public/logo.png", "./public/logo/main-logo.svg"],
  },
};

export default nextConfig;