import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| BADGE TONES NEED A SHADE PER THEME
|--------------------------------------------------------------------------
|
| The background of a badge is a 10% tint of the -500 composited over the
| card, so it is nearly the card's own colour: almost white in light mode,
| almost navy in dark. A single text shade cannot sit on both.
|
| The -400 shades were chosen for the dark theme, where they give 6.5–10:1.
| On white they give 1.54–2.42:1 — badge text is small, so AA wants 4.5:1,
| and "Verified" in amber-400 on white is genuinely hard to read rather
| than merely off-spec.
|
| The -700 shades clear 4.5:1 on the light tint (4.65–5.96:1) while the
| -400s stay for dark. checks/badge-contrast.py reads these class names out
| of this file and computes both, so a shade changed here is re-checked
| rather than assumed.
*/
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-body-sm font-medium",
  {
    variants: {
      status: {
        neutral: "bg-card-hover text-text-muted border border-border",
        success:
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20",
        warning:
          "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
        danger: "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20",
        info: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, status, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ status }), className)} {...props}>
      {/*
        The dot follows the text shade per theme, for the same reason.

        It is aria-hidden and the label beside it carries the meaning, so
        it is decorative and not held to a contrast minimum — but a dot
        nobody can see on a white card is still a dot that is not doing
        its job.
      */}
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "success" && "bg-emerald-700 dark:bg-emerald-400",
          status === "warning" && "bg-amber-700 dark:bg-amber-400",
          status === "danger" && "bg-red-700 dark:bg-red-400",
          status === "info" && "bg-blue-700 dark:bg-blue-400",
          (status === "neutral" || !status) && "bg-text-muted",
        )}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
