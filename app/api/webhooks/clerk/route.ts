import { type WebhookEvent, verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import {
  markProfileDeleted,
  upsertProfileFromWebhook,
} from "@/features/commerce/data";
import {
  isClerkWebhookConfigured,
  isSupabaseConfigured,
} from "@/lib/env";

type UserWebhookPayload = Extract<
  WebhookEvent,
  { type: "user.created" | "user.updated" }
>["data"];

function emailFromUser(user: UserWebhookPayload) {
  const primary = user.email_addresses.find(
    (email) => email.id === user.primary_email_address_id,
  );

  return primary?.email_address || user.email_addresses[0]?.email_address || "";
}

function nameFromUser(user: UserWebhookPayload) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    emailFromUser(user).split("@")[0] ||
    "Merchant"
  );
}

export async function POST(req: NextRequest) {
  if (!isClerkWebhookConfigured()) {
    return Response.json(
      { error: "CLERK_WEBHOOK_SIGNING_SECRET is not configured." },
      { status: 503 },
    );
  }

  try {
    const event = await verifyWebhook(req);

    if (!isSupabaseConfigured()) {
      return Response.json({
        received: true,
        skipped: "Supabase is not configured.",
        type: event.type,
      });
    }

    if (event.type === "user.created" || event.type === "user.updated") {
      const user = event.data;

      await upsertProfileFromWebhook({
        clerkUserId: user.id,
        email: emailFromUser(user),
        name: nameFromUser(user),
        avatarUrl: user.image_url,
      });
    }

    if (event.type === "user.deleted") {
      const deletedUser = event.data;

      if (deletedUser.id) {
        await markProfileDeleted(deletedUser.id);
      }
    }

    return Response.json({ received: true, type: event.type });
  } catch (error) {
    console.error("Clerk webhook verification failed", error);

    return Response.json({ error: "Webhook verification failed." }, { status: 400 });
  }
}
