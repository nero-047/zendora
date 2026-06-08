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

function getUniqueLinks(links: StoreNavigationLink[]) {
  const seen = new Set<string>();

  return links.filter((link) => {
    const key = `${link.label.toLowerCase()}:${link.href.toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function StorefrontHeader({
  action = "cart",
  backHref,
  backLabel,
  maxWidthClassName = "max-w-7xl",
  menus,
  store,
}: {
  action?: "cart" | "checkout" | "continue";
  backHref?: string;
  backLabel?: string;
  maxWidthClassName?: string;
  menus: StoreNavigationMenu[];
  store: Store;
}) {
  const headerLinks = getNavigationLinks(menus, "header");
  const utilityLinks: StoreNavigationLink[] = [
    {
      label: "Collections",
      href: `/stores/${store.slug}/collections`,
    },
    {
      label: "Search",
      href: `/stores/${store.slug}/search`,
    },
    {
      label: "Orders",
      href: `/stores/${store.slug}/orders`,
    },
    {
      label: "Gift cards",
      href: `/stores/${store.slug}/gift-cards`,
    },
    {
      label: "Wishlist",
      href: `/stores/${store.slug}/wishlist`,
    },
    {
      label: "Recently viewed",
      href: `/stores/${store.slug}/recently-viewed`,
    },
    {
      label: "Policies",
      href: `/stores/${store.slug}/policies`,
    },
    {
      label: "Contact",
      href: `/stores/${store.slug}/contact`,
    },
  ];
  const desktopLinks = getUniqueLinks([...headerLinks.slice(0, 6), ...utilityLinks]);
  const mobileLinks = getUniqueLinks([...headerLinks.slice(0, 4), ...utilityLinks]);
  const actionHref =
    action === "continue"
      ? `/stores/${store.slug}`
      : action === "cart"
        ? `/stores/${store.slug}/cart`
      : `/stores/${store.slug}/checkout`;
  const actionLabel =
    action === "continue" ? "Continue shopping" : action === "cart" ? "Cart" : "Checkout";

  return (
    <header className="mx-auto grid gap-0">
      <nav
        aria-label="Storefront navigation"
        className={`mx-auto flex w-full ${maxWidthClassName} items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:px-8`}
      >
        <Link
          className="secondary-button max-w-[52vw] px-3 text-sm"
          href={backHref || `/stores/${store.slug}`}
        >
          {backHref ? <ArrowLeft aria-hidden="true" size={16} /> : null}
          <span className="truncate">{backLabel || store.name}</span>
        </Link>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-4 md:flex">
          {desktopLinks.map((link) => (
            <NavigationLink
              className="truncate text-sm font-semibold text-slate-600 hover:text-slate-950"
              key={`${link.label}:${link.href}`}
              link={link}
            />
          ))}
        </div>

        <Link className="primary-button px-3 text-sm" href={actionHref}>
          <ShoppingBag aria-hidden="true" size={16} />
          {actionLabel}
        </Link>
      </nav>

      <nav
        aria-label="Mobile storefront navigation"
        className={`mx-auto flex w-full ${maxWidthClassName} gap-2 overflow-x-auto px-4 pb-4 sm:px-6 md:hidden`}
      >
        {mobileLinks.map((link) => (
          <NavigationLink
            className="secondary-button min-h-10 shrink-0 px-3 text-sm"
            key={`${link.label}:${link.href}`}
            link={link}
          />
        ))}
      </nav>
    </header>
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
