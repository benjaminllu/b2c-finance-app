import Image from "next/image";
import type { CreditCard } from "@optima/core";
import { cn } from "@optima/ui";

const NETWORK_MARK: Record<CreditCard["network"], string> = {
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "AMEX",
  discover: "DISCOVER",
};

/** Stable hue per issuer, so a generic card still looks distinct without copying anyone's branding. */
const hueOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

/**
 * Card art at the standard 85.6 x 54 mm ratio. Decorative: the card's name is always shown next to it.
 * Without imageUrl it draws a generic card face.
 */
export function CardArt({
  card,
  issuerName,
  className,
}: {
  card: CreditCard;
  issuerName: string;
  className?: string;
}) {
  const box = cn("relative aspect-[1.586] shrink-0 overflow-hidden rounded-md shadow-sm", className);
  if (card.imageUrl) {
    return (
      <span className={box} aria-hidden>
        <Image src={card.imageUrl} alt="" fill unoptimized className="object-cover" />
      </span>
    );
  }
  const hue = hueOf(card.issuerId);
  return (
    <span
      className={cn(box, "flex flex-col justify-between p-[6%] text-white @container")}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 50% 18%))` }}
      aria-hidden
    >
      <span className="truncate text-[max(6px,9cqw)] font-semibold leading-tight">{issuerName}</span>
      <span className="h-[18%] w-[16%] rounded-sm bg-amber-200/80" />
      <span className="flex items-end justify-between gap-1 text-[max(5px,7cqw)] leading-tight">
        <span className="line-clamp-2 opacity-90">{card.name}</span>
        <span className="font-bold italic">{NETWORK_MARK[card.network]}</span>
      </span>
    </span>
  );
}
