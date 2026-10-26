import { Star } from "reicon-react";
import { cn } from "@/lib/utils";

/** Five stars, filled to the rounded rating; the text alternative carries the exact value. */
export default function Stars({ rating, size = 14, className = "" }: { rating: number; size?: number; className?: string }) {
  const rounded = Math.round(rating);
  return <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`Ocena ${rating.toFixed(1).replace(".", ",")} na 5`}>
    {Array.from({ length: 5 }, (_, i) => <Star key={i} size={size} weight={i < rounded ? "Filled" : "Outline"} className={i < rounded ? "text-orange" : "text-muted-foreground/50"}/>)}
  </span>;
}
