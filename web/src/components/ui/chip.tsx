import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Outlined meta chip. Tone is text and a thin stroke, never a fill. */
const chipVariants = cva(
  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap",
  {
    variants: {
      tone: {
        default: "border-neutral-300 text-neutral-600",
        medium: "border-amber-700/40 text-amber-900",
        success: "border-emerald-700/40 text-emerald-800",
        danger: "border-red-700/40 text-red-800",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

function Chip({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof chipVariants>) {
  return <span data-slot="chip" className={cn(chipVariants({ tone }), className)} {...props} />;
}

export { Chip, chipVariants };
