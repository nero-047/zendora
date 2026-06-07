"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { Product } from "@/features/commerce/types";

export type CartLine = {
  productId: string;
  variantId?: string;
  quantity: number;
};

export function getCartStorageKey(storeSlug: string) {
  return `zendora-cart:${storeSlug}`;
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", callback);
  window.addEventListener("zendora-cart", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("zendora-cart", callback);
  };
}

function readSnapshot(storageKey: string) {
  if (typeof window === "undefined") {
    return "[]";
  }

  return window.localStorage.getItem(storageKey) || "[]";
}

function parseSnapshot(snapshot: string) {
  try {
    return JSON.parse(snapshot);
  } catch {
    return [];
  }
}

function dispatchCartChange() {
  window.dispatchEvent(new Event("zendora-cart"));
}

function getCartLineKey(productId: string, variantId?: string) {
  return `${productId}:${variantId || ""}`;
}

function normalizeCartLines(
  lines: unknown,
  productsById: Map<string, Product>,
): CartLine[] {
  if (!Array.isArray(lines)) {
    return [];
  }

  const quantitiesByProduct = new Map<string, number>();

  for (const line of lines) {
    if (
      typeof line !== "object" ||
      !line ||
      !("productId" in line) ||
      !("quantity" in line)
    ) {
      continue;
    }

    const productId = String(line.productId);
    const variantId =
      "variantId" in line && line.variantId ? String(line.variantId) : undefined;
    const product = productsById.get(productId);
    const quantity = Number(line.quantity);

    if (!product || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }

    const activeVariants = product.variants.filter(
      (variant) => variant.status === "active",
    );
    const variant = variantId
      ? activeVariants.find((item) => item.id === variantId)
      : undefined;

    if (activeVariants.length > 0 && !variant) {
      continue;
    }

    if (variantId && activeVariants.length === 0) {
      continue;
    }

    const key = getCartLineKey(productId, variant?.id);
    const inventoryCount = variant?.inventoryCount ?? product.inventoryCount;

    quantitiesByProduct.set(
      key,
      Math.min(
        (quantitiesByProduct.get(key) || 0) + quantity,
        inventoryCount,
        99,
      ),
    );
  }

  return [...quantitiesByProduct.entries()].map(([key, quantity]) => {
    const [productId, variantId] = key.split(":");

    return {
      productId,
      variantId: variantId || undefined,
      quantity,
    };
  });
}

export function useStoreCart(storeSlug: string, products: Product[]) {
  const storageKey = getCartStorageKey(storeSlug);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => readSnapshot(storageKey),
    () => "[]",
  );
  const cart = useMemo(
    () => normalizeCartLines(parseSnapshot(snapshot), productsById),
    [productsById, snapshot],
  );
  const cartItems = useMemo(
    () =>
      cart
        .map((line) => ({
          ...line,
          product: productsById.get(line.productId),
        }))
        .filter(
          (
            line,
          ): line is CartLine & {
            product: Product;
            variant?: Product["variants"][number];
          } => Boolean(line.product),
        )
        .map((line) => ({
          ...line,
          variant: line.variantId
            ? line.product.variants.find((variant) => variant.id === line.variantId)
            : undefined,
        })),
    [cart, productsById],
  );

  const writeCart = useCallback(
    (nextCart: CartLine[]) => {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(storageKey, JSON.stringify(nextCart));
      dispatchCartChange();
    },
    [storageKey],
  );

  const clearCart = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(storageKey);
    dispatchCartChange();
  }, [storageKey]);

  const replaceCart = useCallback(
    (nextCart: CartLine[]) => {
      writeCart(normalizeCartLines(nextCart, productsById));
    },
    [productsById, writeCart],
  );

  const updateQuantity = useCallback(
    (productId: string, nextQuantity: number, variantId?: string) => {
      const product = productsById.get(productId);

      if (!product) {
        return;
      }

      const activeVariants = product.variants.filter(
        (variant) => variant.status === "active",
      );
      const variant = variantId
        ? activeVariants.find((item) => item.id === variantId)
        : undefined;

      if (activeVariants.length > 0 && !variant) {
        return;
      }

      if (variantId && activeVariants.length === 0) {
        return;
      }

      const lineKey = getCartLineKey(productId, variant?.id);

      if (nextQuantity <= 0) {
        writeCart(
          cart.filter(
            (line) => getCartLineKey(line.productId, line.variantId) !== lineKey,
          ),
        );
        return;
      }

      const inventoryCount = variant?.inventoryCount ?? product.inventoryCount;
      const quantity = Math.min(nextQuantity, inventoryCount, 99);
      const existing = cart.find(
        (line) => getCartLineKey(line.productId, line.variantId) === lineKey,
      );

      if (!existing) {
        writeCart([...cart, { productId, variantId: variant?.id, quantity }]);
        return;
      }

      writeCart(
        cart.map((line) =>
          getCartLineKey(line.productId, line.variantId) === lineKey
            ? { ...line, quantity }
            : line,
        ),
      );
    },
    [cart, productsById, writeCart],
  );

  return {
    cart,
    cartItems,
    clearCart,
    replaceCart,
    updateQuantity,
  };
}
