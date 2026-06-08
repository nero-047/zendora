import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { ProductImportForm } from "@/features/commerce/components/product-import-form";
import { getStoreWorkspace } from "@/features/commerce/data";

export default async function ProductImportPage({
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

  const templateHref = `/dashboard/stores/${workspace.store.id}/products/import-template/export`;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="secondary-button w-fit px-4 text-sm"
          href={`/dashboard/stores/${workspace.store.id}/products`}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Products
        </Link>
        <Link className="secondary-button px-4 text-sm" href={templateHref}>
          <Download aria-hidden="true" size={17} />
          Import Template
        </Link>
      </div>

      <ProductImportForm storeId={workspace.store.id} />
    </div>
  );
}
