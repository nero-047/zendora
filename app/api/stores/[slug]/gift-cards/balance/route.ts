import { z } from "zod";

import { getPublicStorefront } from "@/features/commerce/data";
import {
  canRedeemGiftCard,
  giftCardStatusLabels,
  isGiftCardExpired,
  maskGiftCardCode,
  normalizeGiftCardCode,
} from "@/features/commerce/gift-cards";
import { mockGiftCards } from "@/features/commerce/mock-data";
import type { GiftCard } from "@/features/commerce/types";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const giftCardBalanceRateLimit = {
  limit: 45,
  windowMs: 60 * 1000,
};

const giftCardBalanceSchema = z.object({
  code: z.string().trim().min(4).max(40),
});

type GiftCardBalanceRow = {
  code: string;
  balance_cents: number;
  currency: string;
  status: GiftCard["status"];
  expires_at: string | null;
};

function getGiftCardStatusLabel(card: GiftCard) {
  if (isGiftCardExpired(card)) {
    return "Expired";
  }

  if (card.balanceCents <= 0) {
    return "Fully redeemed";
  }

  return giftCardStatusLabels[card.status];
}

async function findLiveGiftCard(input: {
  code: string;
  storeId: string;
}) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_cards")
    .select("code, balance_cents, currency, status, expires_at")
    .eq("store_id", input.storeId)
    .eq("code", input.code)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as GiftCardBalanceRow;

  return {
    balanceCents: row.balance_cents,
    code: row.code,
    createdAt: "",
    currency: row.currency,
    expiresAt: row.expires_at || undefined,
    id: "",
    initialBalanceCents: row.balance_cents,
    redemptions: [],
    status: row.status,
    storeId: input.storeId,
    updatedAt: "",
  } satisfies GiftCard;
}

function findDemoGiftCard(input: { code: string; storeId: string }) {
  return (
    mockGiftCards.find(
      (giftCard) =>
        giftCard.storeId === input.storeId && giftCard.code === input.code,
    ) || null
  );
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Gift card balance rate limit exceeded." },
    {
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
      status: 429,
    },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const clientRateLimit = consumeRateLimit(
    `gift-card-balance:${slug}:${getClientFingerprint(request)}`,
    giftCardBalanceRateLimit,
  );

  if (!clientRateLimit.ok) {
    return rateLimitedResponse(clientRateLimit.retryAfterSeconds);
  }

  const body = await readLimitedJsonBody(request);

  if (!body.ok) {
    return Response.json(
      { ok: false, error: body.error },
      { status: body.status },
    );
  }

  const parsed = giftCardBalanceSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Enter a valid gift card code." },
      { status: 400 },
    );
  }

  const storefront = await getPublicStorefront(slug);

  if (!storefront) {
    return Response.json(
      { ok: false, error: "Storefront is not available." },
      { status: 404 },
    );
  }

  const code = normalizeGiftCardCode(parsed.data.code);
  const isDemoStorefront = storefront.store.id.startsWith("demo-");
  let giftCard: GiftCard | null = null;

  try {
    giftCard =
      isSupabaseConfigured() && !isDemoStorefront
        ? await findLiveGiftCard({ code, storeId: storefront.store.id })
        : findDemoGiftCard({ code, storeId: storefront.store.id });
  } catch {
    return Response.json(
      { ok: false, error: "Gift card balances are not available." },
      { status: 503 },
    );
  }

  if (!giftCard) {
    return Response.json(
      { ok: false, error: "Gift card was not found." },
      { status: 404 },
    );
  }

  const redeemable = canRedeemGiftCard(giftCard);

  return Response.json({
    ok: true,
    card: {
      balanceCents: giftCard.balanceCents,
      code: maskGiftCardCode(giftCard.code),
      currency: giftCard.currency,
      expiresAt: giftCard.expiresAt || null,
      redeemable,
      statusLabel: getGiftCardStatusLabel(giftCard),
    },
  });
}
