import { signIn } from "@/auth"
import Image from "next/image"

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Branded panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-10 lg:flex">
        <div className="relative z-10 flex items-center gap-3">
          <Image
            src="/logo.png"
            width={28}
            height={28}
            alt="Pandora"
            className="opacity-90"
          />
          <span className="text-sm font-medium tracking-tight text-background/80">
            Pandora A/S
          </span>
        </div>

        <div className="relative z-10 max-w-sm">
          <p className="text-[22px] font-medium leading-snug tracking-tight text-background/90">
            Understand every conversation. Improve every interaction.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-background/40">
            AI-powered analytics for conversational systems — monitor quality,
            track evaluations, and surface insights at scale.
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-xs text-background/25">
            &copy; {new Date().getFullYear()} Pandora A/S
          </p>
        </div>

        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      {/* Sign-in form */}
      <div className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[320px]">
          <div className="mb-8 lg:hidden flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground p-1">
              <Image src="/logo.png" width={28} height={28} alt="Pandora" />
            </div>
            <span className="text-sm font-medium tracking-tight">
              Pandora A/S
            </span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
            <p className="text-[13px] text-muted-foreground">
              Use your organization account to continue
            </p>
          </div>

          <form
            action={async () => {
              "use server"
              await signIn("microsoft-entra-id", { redirectTo: "/dashboard" })
            }}
            className="mt-6"
          >
            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-accent"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 21 21"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              Continue with Microsoft
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-muted-foreground/60">
            Protected by Microsoft Entra ID
          </p>
        </div>
      </div>
    </div>
  )
}
