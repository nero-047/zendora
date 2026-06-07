import type { GiftCard, GiftCardStatus } from "@/features/commerce/types";

export const giftCardStatuses = [
  "active",
  "disabled",
  "expired",
] as const satisfies readonly GiftCardStatus[];

export const giftCardStatusLabels: Record<GiftCardStatus, string> = {
  active: "Active",
  disabled: "Disabled",
  expired: "Expired",
};

export function normalizeGiftCardCode(value: string | undefined | null) {
  return value?.trim().toUpperCase().replace(/\s+/g, "-") || "";
}

export function maskGiftCardCode(value: string) {
  const normalized = normalizeGiftCardCode(value);

  if (normalized.length <= 4) {
    return normalized;
  }

  return `**** ${normalized.slice(-4)}`;
}

export function isGiftCardExpired(
  card: Pick<GiftCard, "expiresAt">,
  now = new Date(),
) {
  return Boolean(card.expiresAt && new Date(card.expiresAt).getTime() < now.getTime());
}

export function canRedeemGiftCard(
  card: Pick<GiftCard, "balanceCents" | "expiresAt" | "status">,
  now = new Date(),
) {
  return (
    card.status === "active" &&
    card.balanceCents > 0 &&
    !isGiftCardExpired(card, now)
  );
}

export function calculateGiftCardRedemptionAmount(input: {
  balanceCents: number;
  orderTotalCents: number;
}) {
  if (input.balanceCents <= 0 || input.orderTotalCents <= 0) {
    return 0;
  }

  return Math.min(input.balanceCents, input.orderTotalCents);
}
