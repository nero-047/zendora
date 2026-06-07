import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";

import { getNavigationLinks } from "@/features/commerce/navigation";
import type {
  Store,
  StoreNavigationLink,
  StoreNavigationMenu,
} from "@/features/commerce/types";

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href) || /^mailto:/i.test(href);
}

function NavigationLink({
  className,
  link,
}: {
  className: string;
  link: StoreNavigationLink;
}) {
  if (isExternalHref(link.href)) {
    return (
      <a className={className} href={link.href} rel="noreferrer" target="_blank">
        {link.label}
      </a>
    );
  }

  return (
    <Link className={className} href={link.href}>
      {link.label}
    </Link>
  );
}

export function StorefrontHeader({
  action = "checkout",
  backHref,
  backLabel,
  maxWidthClassName = "max-w-7xl",
  menus,
  store,
}: {
  action?: "checkout" | "continue";
  backHref?: string;
  backLabel?: string;
  maxWidthClassName?: string;
  menus: StoreNavigationMenu[];
  store: Store;
}) {
  const headerLinks = getNavigationLinks(menus, "header");
  const actionHref =
    action === "continue"
      ? `/stores/${store.slug}`
      : `/stores/${store.slug}/checkout`;
  const actionLabel = action === "continue" ? "Continue shopping" : "Checkout";

  return (
    <nav
      className={`mx-auto flex ${maxWidthClassName} items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:px-8`}
    >
      <Link
        className="secondary-button max-w-[52vw] px-3 text-sm"
        href={backHref || `/stores/${store.slug}`}
      >
        {backHref ? <ArrowLeft aria-hidden="true" size={16} /> : null}
        <span className="truncate">{backLabel || store.name}</span>
      </Link>

      {headerLinks.length > 0 ? (
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-4 md:flex">
          {headerLinks.slice(0, 6).map((link) => (
            <NavigationLink
              className="truncate text-sm font-semibold text-slate-600 hover:text-slate-950"
              key={`${link.label}:${link.href}`}
              link={link}
            />
          ))}
        </div>
      ) : null}

      <Link className="primary-button px-3 text-sm" href={actionHref}>
        <ShoppingBag aria-hidden="true" size={16} />
        {actionLabel}
      </Link>
    </nav>
  );
}

export function StorefrontFooter({
  maxWidthClassName = "max-w-7xl",
  menus,
}: {
  maxWidthClassName?: string;
  menus: StoreNavigationMenu[];
}) {
  const footerLinks = getNavigationLinks(menus, "footer");

  if (footerLinks.length === 0) {
    return null;
  }

  return (
    <footer
      className={`mx-auto flex ${maxWidthClassName} flex-wrap gap-3 px-4 pb-10 sm:px-6 lg:px-8`}
    >
      {footerLinks.map((link) => (
        <NavigationLink
          className="text-sm font-semibold text-slate-600 hover:text-slate-950"
          key={`${link.label}:${link.href}`}
          link={link}
        />
      ))}
    </footer>
  );
}
