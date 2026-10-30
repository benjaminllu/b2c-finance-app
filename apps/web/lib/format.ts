const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Integer cents -> "$1,234.56". */
export const formatCents = (cents: number) => usd.format(cents / 100);
/** Integer cents -> "$1,235". */
export const formatCentsWhole = (cents: number) => usdWhole.format(cents / 100);
/** Basis points -> "4.25%". */
export const formatBps = (bps: number) => `${(bps / 100).toFixed(2)}%`;
