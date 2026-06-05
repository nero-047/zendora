"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAppUser } from "@/features/auth/app-user";
import type { ActionState } from "@/features/commerce/action-state";
import {
  getAvailableProductSlug,
  getAvailableStoreSlug,
  getStoreWorkspace,
  upsertProfileForUser,
} from "@/features/commerce/data";
import { productImageBucket, isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

function demoDisabledState(): ActionState {
  return {
    status: "success",
    message:
      "This Server Function is wired. Add Supabase env values to persist the mutation.",
  };
}

function formError(message: string, errors?: ActionState["errors"]): ActionState {
  return {
    status: "error",
    message,
    errors,
  };
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

  const db = getSupabaseAdmin();
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
  const objectPath = `${storeId}/${crypto.randomUUID()}.${safeExtension}`;
  const { error } = await db.storage.from(productImageBucket).upload(objectPath, file, {
    cacheControl: "31536000",
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw error;
  }

  const { data } = db.storage.from(productImageBucket).getPublicUrl(objectPath);

  return {
    imageUrl: data.publicUrl,
    imagePath: objectPath,
  };
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
