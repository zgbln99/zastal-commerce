"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Source: kairoui "essentials" registry (https://www.kairoui.online/r/essentials.json), used as delivered.
const textureButtonVariants = cva(
  "group/texture-button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding p-[1.5px] outline-none transition-all duration-300 ease-in-out select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-primary/40 bg-gradient-to-b from-primary to-primary/70",
        secondary:
          "border-border bg-gradient-to-b from-foreground/15 to-foreground/5 dark:from-foreground/25 dark:to-foreground/10",
        inverse:
          "border-white/25 bg-gradient-to-b from-background to-background/80",
        destructive:
          "border-destructive/40 bg-gradient-to-b from-destructive to-destructive/70",
        icon: "border-border bg-gradient-to-b from-foreground/15 to-foreground/5 dark:from-foreground/25 dark:to-foreground/10",
      },
      size: {
        sm: "rounded-md",
        default: "rounded-lg",
        lg: "rounded-xl",
        icon: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

const textureButtonInnerVariants = cva(
  "relative flex w-full h-full items-center justify-center gap-2 overflow-hidden rounded-[inherit] font-medium transition-colors duration-300 ease-in-out select-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27160%27%20height=%27160%27%3E%3Cfilter%20id=%27n%27%3E%3CfeTurbulence%20type=%27fractalNoise%27%20baseFrequency=%270.8%27%20numOctaves=%272%27%20stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect%20width=%27100%25%27%20height=%27100%25%27%20filter=%27url(%23n)%27/%3E%3C/svg%3E')] after:opacity-50 after:mix-blend-overlay",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-primary to-primary/80 text-primary-foreground group-hover/texture-button:from-primary/90 group-hover/texture-button:to-primary/70 group-active/texture-button:from-primary/85 group-active/texture-button:to-primary/65",
        secondary:
          "bg-gradient-to-b from-card to-muted text-foreground group-hover/texture-button:from-card group-hover/texture-button:to-muted/60 group-active/texture-button:from-muted group-active/texture-button:to-muted/70",
        inverse:
          "bg-gradient-to-b from-background to-background/85 text-foreground group-hover/texture-button:from-background group-hover/texture-button:to-background/70 group-active/texture-button:from-background/90 group-active/texture-button:to-background/75",
        destructive:
          "bg-gradient-to-b from-destructive to-destructive/80 text-destructive-foreground group-hover/texture-button:from-destructive/90 group-hover/texture-button:to-destructive/70 group-active/texture-button:from-destructive/85 group-active/texture-button:to-destructive/65",
        icon: "bg-gradient-to-b from-card to-muted text-muted-foreground group-hover/texture-button:from-card group-hover/texture-button:to-muted/60 group-active/texture-button:from-muted",
      },
      size: {
        sm: "px-4 py-1.5 text-xs",
        default: "px-6 py-2.5 text-sm",
        lg: "px-8 py-3 text-base",
        icon: "p-2.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function TextureButton({
  className,
  children,
  variant = "primary",
  size = "default",
  render,
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof textureButtonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="texture-button"
      className={cn(textureButtonVariants({ variant, size, className }))}
      nativeButton={nativeButton ?? !render}
      render={render}
      {...props}
    >
      <span className={cn(textureButtonInnerVariants({ variant, size }))}>
        {children}
      </span>
    </ButtonPrimitive>
  );
}

export { TextureButton, textureButtonVariants };
