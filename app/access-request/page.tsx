import { signOut } from "@/auth"
import { redirect } from "next/navigation"
import { getAdminContactEmails, getViewer } from "@/lib/authz"

export default async function AccessRequestPage() {
  const viewer = await getViewer()
  if (!viewer) {
    redirect("/login")
  }

  if (viewer.role) {
    redirect("/tracker")
  }

  const adminEmails = await getAdminContactEmails()

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(187,108,37,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,250,243,1)_0%,_rgba(246,240,232,1)_100%)] px-6 py-12">
      <div className="w-full max-w-2xl rounded-3xl border border-amber-200/70 bg-white/90 p-8 shadow-xl shadow-amber-950/5">
        <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">
          Pandora Finance
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Access required</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {viewer.email} is signed in, but there is no role assigned for this account yet.
          Contact one of the admins below to be added as a guest, member, or admin.
        </p>

        <div className="mt-6 rounded-2xl border border-border/70 bg-background/70 p-5">
          <p className="text-sm font-medium">Admin contacts</p>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            {adminEmails.length > 0 ? (
              adminEmails.map((email) => <p key={email}>{email}</p>)
            ) : (
              <p>No admin emails are configured yet.</p>
            )}
          </div>
        </div>

        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
