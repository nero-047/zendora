import { DashboardShell } from "@/features/dashboard/components/dashboard-shell";
import { requireAppUser } from "@/features/auth/app-user";
import {
  listStoresForUser,
  upsertProfileForUser,
} from "@/features/commerce/data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAppUser();

  await upsertProfileForUser(user);

  const stores = await listStoresForUser(user.id);

  return (
    <DashboardShell stores={stores} user={user}>
      {children}
    </DashboardShell>
  );
}
