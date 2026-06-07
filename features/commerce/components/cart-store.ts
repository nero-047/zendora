"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { Product } from "@/features/commerce/types";

export type CartLine = {
  productId: string;
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
    const product = productsById.get(productId);
    const quantity = Number(line.quantity);

    if (!product || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }

    quantitiesByProduct.set(
      productId,
      Math.min(
        (quantitiesByProduct.get(productId) || 0) + quantity,
        product.inventoryCount,
        99,
      ),
    );
  }

  return [...quantitiesByProduct.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
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
          } => Boolean(line.product),
        ),
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

  const updateQuantity = useCallback(
    (productId: string, nextQuantity: number) => {
      const product = productsById.get(productId);

      if (!product) {
        return;
      }

      if (nextQuantity <= 0) {
        writeCart(cart.filter((line) => line.productId !== productId));
        return;
      }

      const quantity = Math.min(nextQuantity, product.inventoryCount, 99);
      const existing = cart.find((line) => line.productId === productId);

      if (!existing) {
        writeCart([...cart, { productId, quantity }]);
        return;
      }

      writeCart(
        cart.map((line) =>
          line.productId === productId ? { ...line, quantity } : line,
        ),
      );
    },
    [cart, productsById, writeCart],
  );

  return {
    cart,
    cartItems,
    clearCart,
    updateQuantity,
  };
}
