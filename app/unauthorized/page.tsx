import { signOut } from "@/auth"
import { redirect } from "next/navigation"
import { getAdminContactEmails, getViewer } from "@/lib/authz"
import { roleLabel } from "@/lib/roles"

export default async function UnauthorizedPage() {
  const viewer = await getViewer()
  if (!viewer) {
    redirect("/login")
  }

  if (!viewer.role) {
    redirect("/access-request")
  }

  const adminEmails = await getAdminContactEmails()

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(191,143,152,0.18),_transparent_32%),linear-gradient(180deg,_rgba(255,249,251,1)_0%,_rgba(245,239,241,1)_100%)] px-6 py-12">
      <div className="w-full max-w-2xl rounded-3xl border brand-card p-8 shadow-xl shadow-rose-950/5">
        <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">
          Pandora Finance
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Role restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {viewer.email} is signed in as {roleLabel(viewer.role)} and does not have access to this page.
        </p>

        <div className="mt-6 rounded-2xl border border-border/70 bg-background/70 p-5">
          <p className="text-sm font-medium">Need broader access?</p>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            {adminEmails.length > 0 ? (
              adminEmails.map((email) => <p key={email}>{email}</p>)
            ) : (
              <p>No admin emails are configured yet.</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <a
            href="/tracker"
            className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Go to tracker
          </a>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-full border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
