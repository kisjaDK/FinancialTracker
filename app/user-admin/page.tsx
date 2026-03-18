import { FinanceAppShell } from "@/components/finance/app-shell";
import { UserAdminBrowser } from "@/components/finance/user-admin-browser";
import { requirePageAccess } from "@/lib/authz";
import { getUserAdminPageData } from "@/lib/user-admin";

export default async function UserAdminPage() {
  const viewer = await requirePageAccess("ADMIN");
  const data = await getUserAdminPageData(viewer);

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/user-admin"
    >
      <UserAdminBrowser
        users={data.users}
        serviceUsers={data.serviceUsers}
        scopeOptions={data.scopeOptions}
        allowedRoles={data.allowedRoles}
      />
    </FinanceAppShell>
  );
}
