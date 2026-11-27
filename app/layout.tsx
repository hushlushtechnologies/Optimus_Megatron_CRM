import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/src/lib/theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/src/lib/theme/constants";
import { ToastProvider } from "@/src/components/shared/toast-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Optimus Megatron Cars — Admin",
  description: "Admin dashboard for Optimus Megatron Cars, UAE premium & luxury automotive marketplace.",
};

/*
 * Runs in <head> before anything else, which is what stops a light-themed
 * page flashing dark on every navigation. It cannot import, so the
 * resolution rule below is a hand-written copy of resolveTheme() in
 * src/lib/theme/constants.ts.
 *
 * Two copies of a rule is how a rule drifts, so this copy is not trusted:
 * test/theme-test.mts reads this exact string out of this file, runs it
 * against a fake document, localStorage and matchMedia, and asserts it agrees
 * with resolveTheme() for every combination of stored value and OS setting.
 * Change one without the other and that test fails.
 *
 * Keep it small and keep it in a try/catch. Anything that throws here leaves
 * the page unstyled.
 */
const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem('${THEME_STORAGE_KEY}');
    var light =
      saved === 'light' ||
      (saved === 'system' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: light)').matches);
    if (light) {
      document.documentElement.classList.add('light');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a
          href="#main-content"
          className="focus:bg-primary focus:shadow-soft-lg sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:px-4 focus:py-2 focus:text-[#0b1220]"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          <MotionConfig reducedMotion="user">
            {children}
            <ToastProvider />
          </MotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
