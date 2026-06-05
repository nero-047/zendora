import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { CreateProductForm } from "@/features/commerce/components/create-product-form";
import { getStoreWorkspace } from "@/features/commerce/data";

export default async function NewProductPage({
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

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Link className="secondary-button w-fit px-3 text-sm" href={`/dashboard/stores/${workspace.store.id}`}>
        <ArrowLeft aria-hidden="true" size={16} />
        {workspace.store.name}
      </Link>
      <CreateProductForm storeId={workspace.store.id} />
    </div>
  );
}
