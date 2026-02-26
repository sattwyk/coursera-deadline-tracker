import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import {
  Card as ShadcnCard,
  CardContent as ShadcnCardContent,
  CardDescription as ShadcnCardDescription,
  CardHeader as ShadcnCardHeader,
  CardTitle as ShadcnCardTitle,
} from "@/components/ui/card";

import "@/components/ui/8bit/styles/retro.css";

const cardVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  defaultVariants: {
    font: "retro",
  },
});

interface BitCardProps extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

function Card({ ...props }: BitCardProps) {
  const { className, font } = props;

  return (
    <div className={cn("relative border-y-6 border-foreground dark:border-ring !p-0", className)}>
      <ShadcnCard
        {...props}
        className={cn("rounded-none border-0 !w-full", font !== "normal" && "retro", className)}
      />

      <div
        className="absolute inset-0 border-x-6 -mx-1.5 border-foreground dark:border-ring pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

function CardHeader({ ...props }: BitCardProps) {
  const { className, font } = props;

  return <ShadcnCardHeader className={cn(font !== "normal" && "retro", className)} {...props} />;
}

function CardTitle({ ...props }: BitCardProps) {
  const { className, font } = props;

  return <ShadcnCardTitle className={cn(font !== "normal" && "retro", className)} {...props} />;
}

function CardDescription({ ...props }: BitCardProps) {
  const { className, font } = props;

  return (
    <ShadcnCardDescription className={cn(font !== "normal" && "retro", className)} {...props} />
  );
}

function CardContent({ ...props }: BitCardProps) {
  const { className, font } = props;

  return <ShadcnCardContent className={cn(font !== "normal" && "retro", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
