import { signOut } from "@/auth"
import { UserAdminBrowser } from "@/components/finance/user-admin-browser"
import { requirePageAccess } from "@/lib/authz"
import { getUserAdminPageData } from "@/lib/user-admin"

export default async function UserAdminPage() {
  const viewer = await requirePageAccess("ADMIN")
  const data = await getUserAdminPageData(viewer)

  return (
    <>
      <UserAdminBrowser
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={data.activeYear}
        users={data.users}
        scopeOptions={data.scopeOptions}
        allowedRoles={data.allowedRoles}
      />

      <form
        action={async () => {
          "use server"
          await signOut({ redirectTo: "/login" })
        }}
        className="fixed right-6 bottom-6"
      >
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-full border border-border bg-background/90 px-4 text-sm font-medium shadow-sm backdrop-blur transition-colors hover:bg-accent"
        >
          Sign out
        </button>
      </form>
    </>
  )
}
