"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { useStoreCart } from "@/features/commerce/components/cart-store";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type StorefrontCartProps = {
  storeSlug: string;
  products: Product[];
};

export function StorefrontCart({ storeSlug, products }: StorefrontCartProps) {
  const { cart, cartItems, updateQuantity } = useStoreCart(storeSlug, products);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = cartItems.reduce(
    (sum, item) => sum + item.product.priceCents * item.quantity,
    0,
  );
  const currency = products[0]?.currency || "USD";

  function addProduct(product: Product) {
    const current = cart.find((line) => line.productId === product.id);

    updateQuantity(product.id, (current?.quantity || 0) + 1);
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const cartLine = cart.find((line) => line.productId === product.id);
          const selectedQuantity = cartLine?.quantity || 0;
          const isSoldOut = product.inventoryCount === 0;

          return (
            <article className="soft-panel overflow-hidden" key={product.id}>
              <Image
                alt={product.name}
                className="product-image"
                height={675}
                sizes="(max-width: 768px) 100vw, 33vw"
                src={product.imageUrl}
                width={900}
              />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-slate-950">{product.name}</h2>
                  <span className="text-sm font-semibold text-slate-950">
                    {formatCurrency(product.priceCents, product.currency)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
                  {product.description}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  {selectedQuantity > 0 ? (
                    <div className="grid flex-1 grid-cols-[44px_1fr_44px] overflow-hidden rounded-[8px] border border-slate-200 bg-white/70">
                      <button
                        aria-label={`Remove one ${product.name}`}
                        className="grid h-11 place-items-center text-slate-700"
                        onClick={() =>
                          updateQuantity(product.id, selectedQuantity - 1)
                        }
                        type="button"
                      >
                        <Minus aria-hidden="true" size={16} />
                      </button>
                      <span className="grid h-11 place-items-center text-sm font-semibold text-slate-950">
                        {selectedQuantity}
                      </span>
                      <button
                        aria-label={`Add one ${product.name}`}
                        className="grid h-11 place-items-center text-slate-700 disabled:text-slate-300"
                        disabled={selectedQuantity >= product.inventoryCount}
                        onClick={() =>
                          updateQuantity(product.id, selectedQuantity + 1)
                        }
                        type="button"
                      >
                        <Plus aria-hidden="true" size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="primary-button flex-1 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"
                      disabled={isSoldOut}
                      onClick={() => addProduct(product)}
                      type="button"
                    >
                      <ShoppingBag aria-hidden="true" size={16} />
                      {isSoldOut ? "Sold out" : "Add to cart"}
                    </button>
                  )}
                </div>
                <p className="mt-3 text-xs font-medium text-slate-500">
                  {product.inventoryCount} in stock
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <aside className="soft-panel h-fit p-4 lg:sticky lg:top-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">Cart</h2>
          <span className="status-pill">{cartCount} items</span>
        </div>

        <div className="mt-4 grid gap-3">
          {cartItems.length > 0 ? (
            cartItems.map((item) => (
              <div className="grid grid-cols-[1fr_auto] gap-3" key={item.productId}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatCurrency(item.product.priceCents, item.product.currency)} x{" "}
                    {item.quantity}
                  </p>
                </div>
                <button
                  aria-label={`Remove ${item.product.name}`}
                  className="icon-button h-10 min-h-10 w-10"
                  onClick={() => updateQuantity(item.productId, 0)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm leading-6 text-slate-500">
              Add products to start an order.
            </p>
          )}
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-500">Total</span>
            <span className="text-xl font-semibold text-slate-950">
              {formatCurrency(totalCents, currency)}
            </span>
          </div>

          {cartItems.length > 0 ? (
            <Link
              className="primary-button mt-4 w-full px-3 text-sm"
              href={`/stores/${storeSlug}/checkout`}
            >
              Checkout
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          ) : (
            <button
              className="primary-button mt-4 w-full px-3 text-sm opacity-55"
              disabled
              type="button"
            >
              Checkout
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          )}
        </div>
      </aside>
    </section>
  );
}
