import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowUpRight } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ChaiUI button. `solid` is the one main action on a screen and carries
 * ArrowUpRight. `outline` mirrors its corners and sits beside it.
 * Orange never fills a button.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        soft: "rounded-md bg-ink font-semibold text-white hover:bg-neutral-800",
        solid: "btn-asym bg-neutral-900 text-white hover:bg-neutral-950",
        outline: "btn-asym-mirror border border-neutral-200 bg-transparent text-ink hover:bg-neutral-100",
        ghost: "rounded-md text-ink hover:bg-neutral-100",
        danger: "rounded-md bg-red-600 font-semibold text-white hover:bg-red-700",
      },
      size: {
        sm: "h-8 gap-1.5 px-3",
        md: "h-9 px-4",
        lg: "h-10 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "soft",
      size: "md",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** An icon after the label. `solid` defaults to ArrowUpRight; pass null to drop it. */
    iconRight?: React.ReactNode;
  };

function Button({ className, variant, size, asChild = false, iconRight, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const icon = iconRight === undefined && variant === "solid" && size !== "icon" ? <ArrowUpRight /> : iconRight;
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props}>
      <Slottable>{children}</Slottable>
      {icon ? (
        <span aria-hidden="true" className="-ml-1 inline-flex">
          {icon}
        </span>
      ) : null}
    </Comp>
  );
}

export { Button, buttonVariants };
