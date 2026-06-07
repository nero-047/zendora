import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle,
  Edit3,
  ExternalLink,
  Gift,
  Layers3,
  Mail,
  PackagePlus,
  Percent,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  UserMinus,
  Users,
  XCircle,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { CollectionForm } from "@/features/commerce/components/collection-form";
import { DiscountForm } from "@/features/commerce/components/discount-form";
import { GiftCardForm } from "@/features/commerce/components/gift-card-form";
import { ShippingZoneForm } from "@/features/commerce/components/shipping-zone-form";
import { StoreLaunchReadinessPanel } from "@/features/commerce/components/store-launch-readiness";
import { StoreNavigationForm } from "@/features/commerce/components/store-navigation-form";
import { StorePageForm } from "@/features/commerce/components/store-page-form";
import { StorePoliciesForm } from "@/features/commerce/components/store-policies-form";
import { StoreSettingsForm } from "@/features/commerce/components/store-settings-form";
import { StoreStatusControls } from "@/features/commerce/components/store-status-controls";
import { TeamInviteForm } from "@/features/commerce/components/team-invite-form";
import { ProductReviewStatusForm } from "@/features/commerce/components/product-review-status-form";
import {
  abandonedCheckoutStatusLabels,
  canQueueAbandonedCheckoutRecovery,
  getAbandonedCheckoutRecoveryHref,
  summarizeAbandonedCheckoutLines,
} from "@/features/commerce/abandoned-checkouts";
import {
  giftCardStatusLabels,
  maskGiftCardCode,
} from "@/features/commerce/gift-cards";
import { productReviewStatusLabels } from "@/features/commerce/reviews";
import {
  getCustomerStats,
  getCustomerSummaries,
} from "@/features/commerce/customers";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getOrderStatusOptions,
  orderStatusLabels,
} from "@/features/commerce/order-status";
import { getStoreLaunchReadiness } from "@/features/commerce/launch-readiness";
import {
  dismissAbandonedCheckoutAction,
  queueAbandonedCheckoutRecoveryAction,
  removeStoreMemberAction,
  revokeStoreInvitationAction,
  updateCollectionStatusAction,
  updateDiscountStatusAction,
  updateGiftCardStatusAction,
  updateOrderStatusAction,
  updateShippingZoneStatusAction,
  updateStoreMemberRoleAction,
} from "@/features/commerce/actions";
import { canStoreRole } from "@/features/commerce/permissions";
import { formatCurrency } from "@/lib/utils";

export default async function StorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const {
    store,
    products,
    collections,
    shippingZones,
    orders,
    abandonedCheckouts,
    productReviews,
    giftCards,
    discounts,
    members,
    invitations,
    auditEvents,
    notifications,
    policies,
    customPages,
    navigationMenus,
    membershipRole,
  } = workspace;
  const canManageTeam = canStoreRole(membershipRole, "manage_team");
  const customers = getCustomerSummaries(
    orders,
    store.currency,
    workspace.customerProfiles,
  );
  const customerStats = getCustomerStats(customers);
  const openAbandonedCheckoutCount = abandonedCheckouts.filter(
    (checkout) => checkout.status === "open",
  ).length;
  const pendingReviewCount = productReviews.filter(
    (review) => review.status === "pending",
  ).length;
  const activeGiftCardBalanceCents = giftCards
    .filter((giftCard) => giftCard.status === "active")
    .reduce((sum, giftCard) => sum + giftCard.balanceCents, 0);
  const publishedPageCount = customPages.filter(
    (page) => page.status === "published",
  ).length;
  const launchReadiness = getStoreLaunchReadiness(workspace);

  return (
    <div className="grid gap-5">
      <div className="glass-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="status-pill mb-3">
              <span className="h-2 w-2 rounded-full" style={{ background: store.themeColor }} />
              {store.status}
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">{store.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {store.description || "A focused workspace for products, inventory, and storefront publishing."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="secondary-button px-4 text-sm" href={`/stores/${store.slug}`}>
              <ExternalLink aria-hidden="true" size={17} />
              View
            </Link>
            <Link className="secondary-button px-4 text-sm" href={`/dashboard/stores/${store.id}/customers`}>
              <Users aria-hidden="true" size={17} />
              Customers
            </Link>
            <Link className="secondary-button px-4 text-sm" href={`/dashboard/stores/${store.id}/analytics`}>
              <BarChart3 aria-hidden="true" size={17} />
              Analytics
            </Link>
            <Link className="secondary-button px-4 text-sm" href={`/dashboard/stores/${store.id}/orders`}>
              <ReceiptText aria-hidden="true" size={17} />
              Orders
            </Link>
            <Link className="secondary-button px-4 text-sm" href={`/dashboard/stores/${store.id}/products`}>
              <ShoppingBag aria-hidden="true" size={17} />
              Products
            </Link>
            <Link className="primary-button px-4 text-sm" href={`/dashboard/stores/${store.id}/products/new`}>
              <PackagePlus aria-hidden="true" size={17} />
              Product
            </Link>
          </div>
        </div>

        <StoreStatusControls storeId={store.id} storeStatus={store.status} />
      </div>

      <StoreLaunchReadinessPanel readiness={launchReadiness} />

      <section className="dashboard-grid">
        {[
          ["Revenue", formatCurrency(store.revenueCents)],
          ["Orders", String(store.orderCount)],
          ["Customers", String(customerStats.totalCustomers)],
          ["Repeat buyers", String(customerStats.repeatCustomers)],
          [
            "Abandoned",
            `${openAbandonedCheckoutCount}/${abandonedCheckouts.length}`,
          ],
          ["Reviews", `${pendingReviewCount}/${productReviews.length}`],
          ["Gift cards", formatCurrency(activeGiftCardBalanceCents, store.currency)],
          ["Pages", `${publishedPageCount}/${customPages.length}`],
          ["Inventory", String(store.inventoryCount)],
          ["Products", String(store.productCount)],
        ].map(([label, value]) => (
          <div className="soft-panel p-4" key={label}>
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <StoreSettingsForm store={store} />

      <StorePoliciesForm
        policies={policies}
        storeId={store.id}
        storeSlug={store.slug}
      />

      <StorePageForm
        pages={customPages}
        storeId={store.id}
        storeSlug={store.slug}
      />

      <StoreNavigationForm menus={navigationMenus} storeId={store.id} />

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        {canManageTeam ? (
          <TeamInviteForm storeId={store.id} />
        ) : (
          <div className="soft-panel p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <ShieldCheck aria-hidden="true" size={18} />
              Team access
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              The store owner controls team invitations and role changes.
            </p>
          </div>
        )}

        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Users aria-hidden="true" size={18} />
              Team
            </h2>
          </div>

          {members.length > 0 ? (
            members.map((member) => {
              const isOwner = member.role === "owner";

              return (
                <div
                  className="border-b border-slate-100 p-4 last:border-0"
                  key={member.userId}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-violet-500/10 text-violet-700">
                      <ShieldCheck aria-hidden="true" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">{member.name}</p>
                        <span className="status-pill">{member.role}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {member.email}
                      </p>
                    </div>
                  </div>

                  {canManageTeam && !isOwner ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <form
                        action={updateStoreMemberRoleAction.bind(
                          null,
                          store.id,
                          member.userId,
                        )}
                        className="grid gap-2 sm:grid-cols-[1fr_auto]"
                      >
                        <select
                          aria-label={`Role for ${member.name}`}
                          className="field min-h-10 py-2 text-sm"
                          defaultValue={member.role}
                          name="role"
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className="secondary-button min-h-10 px-3 text-sm" type="submit">
                          <CheckCircle aria-hidden="true" size={16} />
                          Update
                        </button>
                      </form>
                      <form action={removeStoreMemberAction.bind(null, store.id, member.userId)}>
                        <button className="secondary-button min-h-10 px-3 text-sm" type="submit">
                          <UserMinus aria-hidden="true" size={16} />
                          Remove
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="p-4 text-sm text-slate-500">No team members yet.</p>
          )}

          {invitations.length > 0 ? (
            <div className="border-t border-slate-100">
              <div className="px-4 pt-4 text-xs font-bold uppercase text-slate-400">
                Pending invitations
              </div>
              {invitations.map((invitation) => (
                <div
                  className="border-b border-slate-100 p-4 last:border-0"
                  key={invitation.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {invitation.email}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {invitation.role} / expires{" "}
                        {new Date(invitation.expiresAt).toLocaleDateString("en-US")}
                      </p>
                    </div>
                    {canManageTeam ? (
                      <form
                        action={revokeStoreInvitationAction.bind(
                          null,
                          store.id,
                          invitation.id,
                        )}
                      >
                        <button className="secondary-button min-h-10 px-3 text-sm" type="submit">
                          Revoke
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <ShippingZoneForm storeId={store.id} />

        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Truck aria-hidden="true" size={18} />
              Shipping rates
            </h2>
          </div>
          {shippingZones.length > 0 ? (
            shippingZones.map((zone) => (
              <div className="border-b border-slate-100 p-4 last:border-0" key={zone.id}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-indigo-500/10 text-indigo-700">
                    <Truck aria-hidden="true" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">{zone.name}</p>
                      <span className="status-pill">{zone.status}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      {formatCurrency(zone.rateCents, store.currency)}
                      {zone.freeShippingThresholdCents > 0
                        ? ` / free at ${formatCurrency(zone.freeShippingThresholdCents, store.currency)}`
                        : ""}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {zone.countries.join(", ")}
                    </p>
                  </div>
                </div>

                <form
                  action={updateShippingZoneStatusAction.bind(null, store.id, zone.id)}
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                >
                  <select
                    aria-label={`Status for ${zone.name}`}
                    className="field min-h-10 py-2 text-sm"
                    defaultValue={zone.status}
                    name="status"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                  <button className="secondary-button min-h-10 px-3 text-sm" type="submit">
                    <CheckCircle aria-hidden="true" size={16} />
                    Update
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">No shipping zones yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <CollectionForm products={products} storeId={store.id} />

        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Layers3 aria-hidden="true" size={18} />
              Collections
            </h2>
          </div>
          {collections.length > 0 ? (
            collections.map((collection) => (
              <div
                className="border-b border-slate-100 p-4 last:border-0"
                key={collection.id}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-sky-500/10 text-sky-700">
                    <Layers3 aria-hidden="true" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">
                        {collection.title}
                      </p>
                      <span className="status-pill">{collection.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {collection.productCount} products / {collection.slug}
                    </p>
                    {collection.description ? (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                        {collection.description}
                      </p>
                    ) : null}
                    {collection.status === "active" ? (
                      <Link
                        className="mt-2 inline-flex text-sm font-semibold text-sky-700"
                        href={`/stores/${store.slug}/collections/${collection.slug}`}
                      >
                        View collection
                      </Link>
                    ) : null}
                  </div>
                </div>

                <form
                  action={updateCollectionStatusAction.bind(
                    null,
                    store.id,
                    collection.id,
                  )}
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                >
                  <select
                    aria-label={`Status for ${collection.title}`}
                    className="field min-h-10 py-2 text-sm"
                    defaultValue={collection.status}
                    name="status"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button className="secondary-button min-h-10 px-3 text-sm" type="submit">
                    <CheckCircle aria-hidden="true" size={16} />
                    Update
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">No collections yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DiscountForm storeId={store.id} />

        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-lg font-semibold text-slate-950">Discount codes</h2>
          </div>
          {discounts.length > 0 ? (
            discounts.map((discount) => (
              <div className="border-b border-slate-100 p-4 last:border-0" key={discount.id}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-emerald-500/10 text-emerald-700">
                    <Percent aria-hidden="true" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">{discount.code}</p>
                      <span className="status-pill">{discount.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {discount.type === "percent"
                        ? `${discount.value}% off`
                        : `${formatCurrency(discount.value, store.currency)} off`}
                      {discount.minSubtotalCents > 0
                        ? ` / min ${formatCurrency(discount.minSubtotalCents, store.currency)}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {discount.redemptionCount}
                      {discount.usageLimit ? `/${discount.usageLimit}` : ""} redemptions
                    </p>
                  </div>
                </div>

                <form
                  action={updateDiscountStatusAction.bind(null, store.id, discount.id)}
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                >
                  <select
                    aria-label={`Status for ${discount.code}`}
                    className="field min-h-10 py-2 text-sm"
                    defaultValue={discount.status}
                    name="status"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                  <button className="secondary-button min-h-10 px-3 text-sm" type="submit">
                    <CheckCircle aria-hidden="true" size={16} />
                    Update
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">No discount codes yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <GiftCardForm storeId={store.id} />

        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Gift aria-hidden="true" size={18} />
              Gift cards
            </h2>
          </div>
          {giftCards.length > 0 ? (
            giftCards.map((giftCard) => (
              <div className="border-b border-slate-100 p-4 last:border-0" key={giftCard.id}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-pink-500/10 text-pink-700">
                    <Gift aria-hidden="true" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">
                        {maskGiftCardCode(giftCard.code)}
                      </p>
                      <span className="status-pill">
                        {giftCardStatusLabels[giftCard.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {formatCurrency(giftCard.balanceCents, giftCard.currency)} /{" "}
                      {formatCurrency(
                        giftCard.initialBalanceCents,
                        giftCard.currency,
                      )}{" "}
                      remaining
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {[giftCard.recipientEmail, giftCard.expiresAt
                        ? `expires ${new Date(giftCard.expiresAt).toLocaleDateString("en-US")}`
                        : null]
                        .filter(Boolean)
                        .join(" / ") || "No recipient"}
                    </p>
                    {giftCard.redemptions.length > 0 ? (
                      <p className="mt-2 text-xs font-medium text-slate-500">
                        {giftCard.redemptions.length} redemptions / last{" "}
                        {new Date(
                          giftCard.redemptions[0].createdAt,
                        ).toLocaleDateString("en-US")}
                      </p>
                    ) : null}
                  </div>
                </div>

                <form
                  action={updateGiftCardStatusAction.bind(null, store.id, giftCard.id)}
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                >
                  <select
                    aria-label={`Status for ${maskGiftCardCode(giftCard.code)}`}
                    className="field min-h-10 py-2 text-sm"
                    defaultValue={giftCard.status}
                    name="status"
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                    <option value="expired">Expired</option>
                  </select>
                  <button className="secondary-button min-h-10 px-3 text-sm" type="submit">
                    <CheckCircle aria-hidden="true" size={16} />
                    Update
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">No gift cards issued yet.</p>
          )}
        </div>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Mail aria-hidden="true" size={18} />
            Abandoned checkouts
          </h2>
        </div>
        {abandonedCheckouts.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {abandonedCheckouts.slice(0, 6).map((checkout) => {
              const summary = summarizeAbandonedCheckoutLines(checkout.lines);
              const recoveryHref = getAbandonedCheckoutRecoveryHref({
                storeSlug: store.slug,
                recoveryToken: checkout.recoveryToken,
              });
              const canRecover = canQueueAbandonedCheckoutRecovery(checkout);

              return (
                <div
                  className="grid gap-4 p-4 xl:grid-cols-[1fr_auto]"
                  key={checkout.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {checkout.customerName || "Guest customer"}
                      </p>
                      <span className="status-pill">
                        {abandonedCheckoutStatusLabels[checkout.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-slate-500">
                      {checkout.customerEmail}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {summary.itemCount} items /{" "}
                      {formatCurrency(checkout.subtotalCents, checkout.currency)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Last seen{" "}
                      {new Date(checkout.lastSeenAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      / {checkout.recoveryEmailCount} recovery emails
                    </p>
                    {checkout.lines.length > 0 ? (
                      <div className="mt-3 grid gap-1 text-xs text-slate-500">
                        {checkout.lines.slice(0, 3).map((line) => (
                          <p
                            className="truncate"
                            key={`${checkout.id}:${line.productId}:${line.productVariantId || ""}`}
                          >
                            {line.quantity} x {line.productName}
                            {line.variantName ? ` (${line.variantName})` : ""}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-start gap-2 xl:justify-end">
                    <Link
                      className="secondary-button min-h-10 px-3 text-sm"
                      href={recoveryHref}
                    >
                      <ExternalLink aria-hidden="true" size={16} />
                      Open
                    </Link>
                    <form
                      action={queueAbandonedCheckoutRecoveryAction.bind(
                        null,
                        store.id,
                        checkout.id,
                      )}
                    >
                      <button
                        className="secondary-button min-h-10 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canRecover}
                        type="submit"
                      >
                        <Mail aria-hidden="true" size={16} />
                        Send
                      </button>
                    </form>
                    <form
                      action={dismissAbandonedCheckoutAction.bind(
                        null,
                        store.id,
                        checkout.id,
                      )}
                    >
                      <button
                        className="secondary-button min-h-10 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={checkout.status !== "open"}
                        type="submit"
                      >
                        <XCircle aria-hidden="true" size={16} />
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            Recoverable carts will appear after a customer enters an email at checkout.
          </p>
        )}
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Star aria-hidden="true" size={18} />
            Product reviews
          </h2>
        </div>
        {productReviews.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {productReviews.slice(0, 6).map((review) => {
              const product = products.find((item) => item.id === review.productId);

              return (
                <div
                  className="grid gap-4 p-4 xl:grid-cols-[1fr_360px]"
                  key={review.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {product?.name || "Product review"}
                      </p>
                      <span className="status-pill">
                        {productReviewStatusLabels[review.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-slate-500">
                      {review.customerEmail} /{" "}
                      {new Date(review.reviewedAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-slate-950">
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          aria-hidden="true"
                          className={
                            index < review.rating
                              ? "fill-slate-950 text-slate-950"
                              : "text-slate-300"
                          }
                          key={index}
                          size={14}
                        />
                      ))}
                    </div>
                    {review.title ? (
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {review.title}
                      </p>
                    ) : null}
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                      {review.body}
                    </p>
                  </div>
                  <ProductReviewStatusForm review={review} storeId={store.id} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            Verified customer reviews will appear here for moderation.
          </p>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Products</h2>
            <Link className="text-sm font-semibold text-sky-700" href={`/dashboard/stores/${store.id}/products`}>
              View all
            </Link>
          </div>
          <div className="soft-panel overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 sm:grid-cols-[1fr_auto_auto_auto]">
              <span>Product</span>
              <span className="hidden sm:inline">Stock</span>
              <span className="hidden sm:inline">Price</span>
              <span>Edit</span>
            </div>
            {products.map((product) => (
              <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:grid-cols-[1fr_auto_auto_auto]" key={product.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <Image
                    alt={product.name}
                    className="h-14 w-14 rounded-[8px] object-cover"
                    height={112}
                    src={product.imageUrl}
                    width={112}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{product.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[
                        product.status,
                        product.category,
                        product.variants.length > 0
                          ? `${product.variants.length} variants`
                          : product.sku,
                      ].filter(Boolean).join(" / ")}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-700 sm:hidden">
                      {product.inventoryCount} in stock /{" "}
                      {product.variants.length > 0 ? "From " : ""}
                      {formatCurrency(product.priceCents, product.currency)}
                    </p>
                  </div>
                </div>
                <span className="hidden text-sm font-semibold text-slate-700 sm:inline">{product.inventoryCount}</span>
                <span className="hidden text-sm font-semibold text-slate-950 sm:inline">
                  {product.variants.length > 0 ? "From " : ""}
                  {formatCurrency(product.priceCents, product.currency)}
                </span>
                <Link
                  aria-label={`Edit ${product.name}`}
                  className="icon-button h-10 min-h-10 w-10"
                  href={`/dashboard/stores/${store.id}/products/${product.id}/edit`}
                >
                  <Edit3 aria-hidden="true" size={16} />
                </Link>
              </div>
            ))}
            {products.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">No products yet.</div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Recent orders</h2>
            <Link className="text-sm font-semibold text-sky-700" href={`/dashboard/stores/${store.id}/orders`}>
              View all
            </Link>
          </div>
          <div className="soft-panel overflow-hidden">
            {orders.length > 0 ? (
              orders.slice(0, 6).map((order) => (
                <div className="border-b border-slate-100 p-4 last:border-0" key={order.id}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-sky-500/10 text-sky-700">
                      <ShoppingBag aria-hidden="true" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950">{order.customerName}</p>
                      <p className="truncate text-xs text-slate-500">{order.customerEmail}</p>
                      <span className="status-pill mt-2 w-fit">
                        {orderStatusLabels[order.status]}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-950">
                      {order.refundedCents > 0
                        ? formatCurrency(order.refundableCents, order.currency)
                        : formatCurrency(order.totalCents, order.currency)}
                    </span>
                  </div>
                  {order.refundedCents > 0 ? (
                    <p className="mt-2 pl-[52px] text-xs font-medium text-red-600">
                      {formatCurrency(order.refundedCents, order.currency)} refunded
                    </p>
                  ) : null}

                  {order.items?.length ? (
                    <div className="mt-3 grid gap-1 pl-[52px] text-xs text-slate-500">
                      {order.items.slice(0, 3).map((item) => (
                        <p className="truncate" key={item.id}>
                          {item.quantity} x {item.productName}
                          {item.variantName ? ` (${item.variantName})` : ""}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <form
                    action={updateOrderStatusAction.bind(null, store.id, order.id)}
                    className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
                  >
                    <select
                      aria-label={`Status for ${order.customerName}`}
                      className="field min-h-10 py-2 text-sm"
                      defaultValue={order.status}
                      name="status"
                    >
                      {getOrderStatusOptions(order.status).map((status) => (
                        <option key={status} value={status}>
                          {orderStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="secondary-button min-h-10 px-3 text-sm"
                      disabled={getOrderStatusOptions(order.status).length === 1}
                      type="submit"
                    >
                      <CheckCircle aria-hidden="true" size={16} />
                      Update
                    </button>
                    <Link
                      className="secondary-button min-h-10 px-3 text-sm"
                      href={`/dashboard/stores/${store.id}/orders/${order.id}`}
                    >
                      <ReceiptText aria-hidden="true" size={16} />
                      Details
                    </Link>
                  </form>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">Orders will appear here after checkout.</p>
            )}
          </div>
        </div>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Mail aria-hidden="true" size={18} />
            Notification outbox
          </h2>
        </div>
        {notifications.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {notifications.slice(0, 10).map((notification) => (
              <div
                className="grid gap-3 p-4 md:grid-cols-[1fr_auto]"
                key={notification.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {notification.subject}
                    </p>
                    <span className="status-pill">{notification.status}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-medium text-slate-500">
                    {notification.recipientEmail} /{" "}
                    {notification.type.replaceAll("_", " ")}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                    {notification.preview}
                  </p>
                </div>
                <time
                  className="text-xs font-semibold text-slate-500 md:text-right"
                  dateTime={notification.createdAt}
                >
                  {new Date(notification.createdAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">No notifications queued yet.</p>
        )}
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Activity aria-hidden="true" size={18} />
            Activity log
          </h2>
        </div>
        {auditEvents.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {auditEvents.slice(0, 10).map((event) => (
              <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]" key={event.id}>
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {event.summary}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {event.action.replaceAll("_", " ")} / {event.resourceType}
                  </p>
                </div>
                <time
                  className="text-xs font-semibold text-slate-500 sm:text-right"
                  dateTime={event.createdAt}
                >
                  {new Date(event.createdAt).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            Store activity will appear here as your team makes changes.
          </p>
        )}
      </section>

      <Link className="secondary-button w-fit px-4 text-sm" href="/dashboard">
        <ArrowUpRight aria-hidden="true" size={16} />
        Back to dashboard
      </Link>
    </div>
  );
}
