"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { Product } from "@/features/commerce/types";
import {
  getRecentlyViewedStorageKey,
  normalizeRecentlyViewedProductIds,
  recordRecentlyViewedProductId,
} from "@/features/commerce/recently-viewed";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", callback);
  window.addEventListener("zendora-recently-viewed", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("zendora-recently-viewed", callback);
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

function dispatchRecentlyViewedChange() {
  window.dispatchEvent(new Event("zendora-recently-viewed"));
}

export function useRecentlyViewedProducts(storeSlug: string, products: Product[]) {
  const storageKey = getRecentlyViewedStorageKey(storeSlug);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => readSnapshot(storageKey),
    () => "[]",
  );
  const productIds = useMemo(
    () => normalizeRecentlyViewedProductIds(parseSnapshot(snapshot), products),
    [products, snapshot],
  );
  const recentlyViewedProducts = useMemo(
    () =>
      productIds
        .map((productId) => productsById.get(productId))
        .filter((product): product is Product => Boolean(product)),
    [productIds, productsById],
  );

  const writeRecentlyViewed = useCallback(
    (nextProductIds: string[]) => {
      if (typeof window === "undefined") {
        return;
      }

      const normalized = normalizeRecentlyViewedProductIds(nextProductIds, products);

      window.localStorage.setItem(storageKey, JSON.stringify(normalized));
      dispatchRecentlyViewedChange();
    },
    [products, storageKey],
  );

  const clearRecentlyViewed = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(storageKey);
    dispatchRecentlyViewedChange();
  }, [storageKey]);

  const recordRecentlyViewed = useCallback(
    (productId: string) => {
      const nextProductIds = recordRecentlyViewedProductId({
        currentProductIds: productIds,
        productId,
        products,
      });

      writeRecentlyViewed(nextProductIds);
    },
    [productIds, products, writeRecentlyViewed],
  );

  return {
    clearRecentlyViewed,
    productIds,
    recentlyViewedProducts,
    recordRecentlyViewed,
  };
}

export function RecentlyViewedTracker({
  productId,
  products,
  storeSlug,
}: {
  productId: string;
  products: Product[];
  storeSlug: string;
}) {
  const { recordRecentlyViewed } = useRecentlyViewedProducts(storeSlug, products);

  useEffect(() => {
    recordRecentlyViewed(productId);
  }, [productId, recordRecentlyViewed]);

  return null;
}
