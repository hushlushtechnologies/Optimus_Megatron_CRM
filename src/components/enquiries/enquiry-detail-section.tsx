import { motion } from "motion/react";

import { cn } from "@/src/lib/utils/cn";

interface EnquiryFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * One labelled value on a detail screen.
 *
 * break-words rather than truncate: an email address or a customer's note is
 * worth two lines, and a detail page that hides the end of a phone number is
 * no use to the person about to dial it.
 */
export function EnquiryField({ label, children, className }: EnquiryFieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-label">{label}</p>
      <div className="text-body-sm text-text-primary mt-1 break-words">{children}</div>
    </div>
  );
}

/** What a field shows when there is nothing in it. */
export function EnquiryFieldEmpty({ children = "Not given" }: { children?: React.ReactNode }) {
  return <span className="text-text-subtle">{children}</span>;
}

interface EnquirySectionProps {
  title: string;
  /** Position in the stagger. Sections appear in reading order. */
  index?: number;
  icon?: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A titled block on a detail screen.
 *
 * Wraps the card, the heading and the stagger so every section on every
 * enquiry type lines up, and so a new section is three lines rather than a
 * copied div with the spacing slightly wrong.
 */
export function EnquirySection({
  title,
  index = 0,
  icon,
  description,
  action,
  children,
  className,
}: EnquirySectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      aria-label={title}
      className={cn("surface-card flex flex-col gap-4 p-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-label flex items-center gap-1.5">
            {icon}
            {title}
          </p>

          {description && <p className="text-caption text-text-subtle mt-1">{description}</p>}
        </div>

        {action}
      </div>

      {children}
    </motion.section>
  );
}

/** The error state inside a section whose own data failed to load. */
export function EnquirySectionFailed({ what }: { what: string }) {
  return (
    <p
      role="alert"
      className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
    >
      The {what} couldn&apos;t be loaded. Refresh the page to try again.
    </p>
  );
}
