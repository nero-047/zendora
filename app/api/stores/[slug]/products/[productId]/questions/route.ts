import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getPublicStorefront } from "@/features/commerce/data";
import {
  createProductQuestionPreview,
  createProductQuestionSubject,
  normalizeProductQuestionText,
  productQuestionTopicLabels,
  productQuestionTopics,
} from "@/features/commerce/product-questions";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const productQuestionIpRateLimit = {
  limit: 30,
  windowMs: 60 * 1000,
};
const productQuestionEmailRateLimit = {
  limit: 5,
  windowMs: 60 * 1000,
};

const productQuestionSchema = z.object({
  email: z.string().trim().email().max(120),
  message: z.string().trim().min(10).max(1200),
  name: z.string().trim().min(2).max(80),
  topic: z.enum(productQuestionTopics),
});

function createDemoQuestionId() {
  return `demo-product-question-${randomBytes(6).toString("hex")}`;
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Product question rate limit exceeded." },
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
  context: { params: Promise<{ slug: string; productId: string }> },
) {
  const { productId, slug } = await context.params;
  const clientRateLimit = consumeRateLimit(
    `product-question:${slug}:${getClientFingerprint(request)}`,
    productQuestionIpRateLimit,
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

  const parsed = productQuestionSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the product question details." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const emailRateLimit = consumeRateLimit(
    `product-question:email:${slug}:${productId}:${email}`,
    productQuestionEmailRateLimit,
  );

  if (!emailRateLimit.ok) {
    return rateLimitedResponse(emailRateLimit.retryAfterSeconds);
  }

  const storefront = await getPublicStorefront(slug);

  if (!storefront) {
    return Response.json(
      { ok: false, error: "Storefront is not available." },
      { status: 404 },
    );
  }

  const product = storefront.products.find((item) => item.id === productId);

  if (!product) {
    return Response.json(
      { ok: false, error: "Product is not available." },
      { status: 404 },
    );
  }

  const message = normalizeProductQuestionText(parsed.data.message);
  const subject = createProductQuestionSubject({
    productName: product.name,
    storeName: storefront.store.name,
    topic: parsed.data.topic,
  });
  const preview = createProductQuestionPreview({
    message,
    productName: product.name,
    topic: parsed.data.topic,
  });
  const metadata = {
    customerEmail: email,
    message,
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    source: "storefront_product_question",
    topic: parsed.data.topic,
    topicLabel: productQuestionTopicLabels[parsed.data.topic],
  };
  const isDemoStorefront = storefront.store.id.startsWith("demo-");

  if (!isSupabaseConfigured() || isDemoStorefront) {
    return Response.json({
      ok: true,
      demo: true,
      questionId: createDemoQuestionId(),
    });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("store_notifications")
    .insert({
      store_id: storefront.store.id,
      type: "customer_message",
      status: "pending",
      recipient_email: email,
      recipient_name: parsed.data.name.trim(),
      subject,
      preview,
      resource_type: "customer_product_question",
      resource_id: product.id,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { ok: false, error: "Product question could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    questionId: (data as { id: string }).id,
  });
}
