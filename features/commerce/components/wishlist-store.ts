"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { Product } from "@/features/commerce/types";
import {
  getWishlistStorageKey,
  normalizeWishlistProductIds,
} from "@/features/commerce/wishlist";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", callback);
  window.addEventListener("zendora-wishlist", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("zendora-wishlist", callback);
  };
}

function readSnapshot(storageKey: string, fallbackSnapshot = "[]") {
  if (typeof window === "undefined") {
    return fallbackSnapshot;
  }

  return window.localStorage.getItem(storageKey) || fallbackSnapshot;
}

function parseSnapshot(snapshot: string) {
  try {
    return JSON.parse(snapshot);
  } catch {
    return [];
  }
}

function dispatchWishlistChange() {
  window.dispatchEvent(new Event("zendora-wishlist"));
}

export function useStoreWishlist(storeSlug: string, products: Product[]) {
  const storageKey = getWishlistStorageKey(storeSlug);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => readSnapshot(storageKey),
    () => "[]",
  );
  const wishlistProductIds = useMemo(
    () => normalizeWishlistProductIds(parseSnapshot(snapshot), products),
    [products, snapshot],
  );
  const wishlistItems = useMemo(
    () =>
      wishlistProductIds
        .map((productId) => productsById.get(productId))
        .filter((product): product is Product => Boolean(product)),
    [productsById, wishlistProductIds],
  );
  const wishlistSet = useMemo(
    () => new Set(wishlistProductIds),
    [wishlistProductIds],
  );

  const writeWishlist = useCallback(
    (nextProductIds: string[]) => {
      if (typeof window === "undefined") {
        return;
      }

      const normalized = normalizeWishlistProductIds(nextProductIds, products);

      window.localStorage.setItem(storageKey, JSON.stringify(normalized));
      dispatchWishlistChange();
    },
    [products, storageKey],
  );

  const clearWishlist = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(storageKey);
    dispatchWishlistChange();
  }, [storageKey]);

  const toggleWishlistProduct = useCallback(
    (productId: string) => {
      if (!productsById.has(productId)) {
        return;
      }

      if (wishlistSet.has(productId)) {
        writeWishlist(wishlistProductIds.filter((id) => id !== productId));
        return;
      }

      writeWishlist([productId, ...wishlistProductIds]);
    },
    [productsById, wishlistProductIds, wishlistSet, writeWishlist],
  );

  return {
    clearWishlist,
    isWishlisted: (productId: string) => wishlistSet.has(productId),
    toggleWishlistProduct,
    wishlistItems,
    wishlistProductIds,
  };
}
