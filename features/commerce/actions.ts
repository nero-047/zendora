"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAppUser } from "@/features/auth/app-user";
import type { ActionState } from "@/features/commerce/action-state";
import type { Product } from "@/features/commerce/types";
import {
  getAvailableProductSlug,
  getAvailableStoreSlug,
  getLivePublicStorefront,
  getStoreWorkspace,
  upsertProfileForUser,
} from "@/features/commerce/data";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadProductImageObject } from "@/lib/supabase/storage";
import { toPriceCents } from "@/lib/utils";

const storeSchema = z.object({
  name: z.string().trim().min(2, "Store name must be at least 2 characters."),
  description: z.string().trim().max(220, "Keep descriptions under 220 characters."),
  currency: z.string().trim().length(3, "Use a 3-letter currency code."),
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #0f766e."),
});

const productSchema = z.object({
  name: z.string().trim().min(2, "Product name must be at least 2 characters."),
  description: z.string().trim().max(500, "Keep descriptions under 500 characters."),
  price: z.string().trim().min(1, "Add a price."),
  inventory: z.coerce
    .number()
    .int("Inventory must be a whole number.")
    .min(0, "Inventory cannot be negative."),
  status: z.enum(["draft", "active"]),
});

const checkoutLineSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(99, "Quantity must be 99 or lower."),
});

const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Add the customer name.")
    .max(80, "Keep the name under 80 characters."),
  customerEmail: z.string().trim().email("Add a valid customer email."),
  cart: z.array(checkoutLineSchema).min(1, "Add at least one item."),
});

const orderStatusSchema = z.object({
  status: z.enum(["pending", "paid", "fulfilled", "cancelled"]),
});

function demoDisabledState(): ActionState {
  return {
    status: "success",
    message:
      "This Server Function is wired. Add Supabase env values to persist the mutation.",
  };
}

function checkoutDisabledState(): ActionState {
  return {
    status: "error",
    message:
      "Checkout needs SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY before it can create orders.",
  };
}

function formError(message: string, errors?: ActionState["errors"]): ActionState {
  return {
    status: "error",
    message,
    errors,
  };
}

function readCartPayload(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeCartLines(
  lines: Array<z.infer<typeof checkoutLineSchema>>,
) {
  const quantitiesByProduct = new Map<string, number>();

  for (const line of lines) {
    quantitiesByProduct.set(
      line.productId,
      (quantitiesByProduct.get(line.productId) || 0) + line.quantity,
    );
  }

  return [...quantitiesByProduct.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

async function assertStoreAccess(userId: string, storeId: string) {
  const workspace = await getStoreWorkspace(userId, storeId);

  if (!workspace) {
    throw new Error("You do not have access to this store.");
  }

  return workspace;
}

async function uploadProductImage(storeId: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return { imageUrl: null, imagePath: null };
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Product image must be an image file.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Product image must be smaller than 5MB.");
  }

  return uploadProductImageObject(storeId, file);
}

export async function createStoreAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = storeSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    currency: formData.get("currency"),
    themeColor: formData.get("themeColor"),
  });

  if (!parsed.success) {
    return formError("Check the store details.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  await upsertProfileForUser(user);

  const db = getSupabaseAdmin();
  const slug = await getAvailableStoreSlug(parsed.data.name);
  const { data: store, error } = await db
    .from("stores")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      currency: parsed.data.currency.toUpperCase(),
      theme_color: parsed.data.themeColor,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    return formError(error.message);
  }

  const { error: membershipError } = await db.from("store_memberships").insert({
    store_id: store.id,
    clerk_user_id: user.id,
    role: "owner",
  });

  if (membershipError) {
    return formError(membershipError.message);
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/stores/${store.id}`);
}

export async function createProductAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    inventory: formData.get("inventory"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return formError("Check the product details.", parsed.error.flatten().fieldErrors);
  }

  const priceCents = toPriceCents(parsed.data.price);

  if (priceCents === null || priceCents < 0) {
    return formError("Add a valid product price.", {
      price: ["Price must be a positive number."],
    });
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const slug = await getAvailableProductSlug(storeId, parsed.data.name);

  try {
    const image = await uploadProductImage(storeId, formData.get("image"));
    const { error } = await db.from("products").insert({
      store_id: storeId,
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      price_cents: priceCents,
      currency: workspace.store.currency,
      inventory_count: parsed.data.inventory,
      image_url: image.imageUrl,
      image_path: image.imagePath,
      status: parsed.data.status,
    });

    if (error) {
      return formError(error.message);
    }
  } catch (error) {
    return formError(error instanceof Error ? error.message : "Could not save product.");
  }

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: "Product saved.",
  };
}

export async function createCheckoutOrderAction(
  storeSlug: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = checkoutSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    cart: readCartPayload(formData.get("cart")),
  });

  if (!parsed.success) {
    return formError("Check the checkout details.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return checkoutDisabledState();
  }

  let storefront;

  try {
    storefront = await getLivePublicStorefront(storeSlug);
  } catch {
    return formError("Checkout database is not ready. Run the Supabase schema first.");
  }

  if (!storefront) {
    return formError("This store is not accepting orders.");
  }

  const cartLines = normalizeCartLines(parsed.data.cart);
  const hasTooManyItems = cartLines.some((line) => line.quantity > 99);

  if (hasTooManyItems) {
    return formError("Keep each line item quantity at 99 or lower.");
  }

  const productsById = new Map(
    storefront.products.map((product) => [product.id, product]),
  );
  const orderItems: Array<{
    product: Product;
    quantity: number;
    lineTotalCents: number;
  }> = [];

  for (const line of cartLines) {
    const product = productsById.get(line.productId);

    if (!product) {
      return formError("One or more cart items are no longer available.");
    }

    if (product.inventoryCount < line.quantity) {
      return formError(`${product.name} only has ${product.inventoryCount} in stock.`);
    }

    orderItems.push({
      product,
      quantity: line.quantity,
      lineTotalCents: product.priceCents * line.quantity,
    });
  }

  const totalCents = orderItems.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0,
  );

  if (totalCents <= 0) {
    return formError("Add at least one priced item before checkout.");
  }

  const db = getSupabaseAdmin();
  const decrementedProductIds: Array<{
    id: string;
    inventoryCount: number;
  }> = [];

  for (const item of orderItems) {
    const nextInventory = item.product.inventoryCount - item.quantity;
    const { data, error } = await db
      .from("products")
      .update({ inventory_count: nextInventory })
      .eq("id", item.product.id)
      .eq("store_id", storefront.store.id)
      .eq("inventory_count", item.product.inventoryCount)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      for (const reverted of decrementedProductIds) {
        await db
          .from("products")
          .update({ inventory_count: reverted.inventoryCount })
          .eq("id", reverted.id);
      }

      return formError(
        error?.message || "Inventory changed while checkout was in progress.",
      );
    }

    decrementedProductIds.push({
      id: item.product.id,
      inventoryCount: item.product.inventoryCount,
    });
  }

  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      store_id: storefront.store.id,
      customer_name: parsed.data.customerName,
      customer_email: parsed.data.customerEmail,
      status: "pending",
      total_cents: totalCents,
      currency: storefront.store.currency,
    })
    .select("id")
    .single();

  if (orderError) {
    for (const reverted of decrementedProductIds) {
      await db
        .from("products")
        .update({ inventory_count: reverted.inventoryCount })
        .eq("id", reverted.id);
    }

    return formError(orderError.message);
  }

  const { error: itemError } = await db.from("order_items").insert(
    orderItems.map((item) => ({
      order_id: order.id,
      product_id: item.product.id,
      product_name: item.product.name,
      unit_price_cents: item.product.priceCents,
      quantity: item.quantity,
    })),
  );

  if (itemError) {
    await db.from("orders").delete().eq("id", order.id);

    for (const reverted of decrementedProductIds) {
      await db
        .from("products")
        .update({ inventory_count: reverted.inventoryCount })
        .eq("id", reverted.id);
    }

    return formError(itemError.message);
  }

  revalidatePath(`/stores/${storefront.store.slug}`);
  revalidatePath(`/stores/${storefront.store.slug}/checkout`);
  revalidatePath(`/dashboard/stores/${storefront.store.id}`);

  return {
    status: "success",
    message: `Order ${order.id.slice(0, 8)} received.`,
  };
}

export async function publishStoreAction(storeId: string) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({ status: "active" })
    .eq("id", storeId);

  if (error) {
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
}

export async function pauseStoreAction(storeId: string) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({ status: "paused" })
    .eq("id", storeId);

  if (error) {
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
}

export async function updateOrderStatusAction(
  storeId: string,
  orderId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = orderStatusSchema.safeParse({
    status: formData.get("status"),
  });

  if (!parsed.success) {
    throw new Error("Choose a valid order status.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("orders")
    .update({ status: parsed.data.status })
    .eq("id", orderId)
    .eq("store_id", storeId);

  if (error) {
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
}
