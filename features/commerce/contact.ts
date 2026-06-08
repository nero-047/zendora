export const storefrontContactReasons = [
  "order",
  "product",
  "returns",
  "wholesale",
  "other",
] as const;

export type StorefrontContactReason = (typeof storefrontContactReasons)[number];

export const storefrontContactReasonLabels: Record<
  StorefrontContactReason,
  string
> = {
  order: "Order question",
  product: "Product question",
  returns: "Return or refund",
  wholesale: "Wholesale",
  other: "Other",
};

export function normalizeContactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function createContactPreview(message: string, maxLength = 220) {
  const normalized = normalizeContactText(message);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function createContactSubject(input: {
  reason: StorefrontContactReason;
  storeName: string;
  subject?: string | null;
}) {
  const reasonLabel = storefrontContactReasonLabels[input.reason];
  const subject = normalizeContactText(input.subject || "");

  return subject
    ? `${input.storeName} contact: ${subject}`
    : `${input.storeName} contact: ${reasonLabel}`;
}
