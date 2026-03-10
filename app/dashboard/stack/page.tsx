"use client"

import {
  Blocks,
  Database,
  KeyRound,
  Layers,
  LayoutTemplate,
  Paintbrush,
  Sparkles,
  BarChart3,
  Shield,
  Zap,
  PackageCheck,
  BrainCircuit,
  ExternalLink,
} from "lucide-react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

interface StackItemProps {
  icon: React.ComponentType<{ className?: string }>
  name: string
  version: string
  category: string
  description: string
  highlights: string[]
  color: string
}

function StackCard({ icon: Icon, name, version, category, description, highlights, color }: StackItemProps) {
  return (
    <Card className="border-border/50 group">
      <CardContent className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{name}</span>
              <Badge variant="outline" className="text-[10px] font-normal border-border/50 text-muted-foreground px-1.5 py-0">
                {version}
              </Badge>
            </div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {category}
            </span>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {highlights.map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function InsightCard({
  icon: Icon,
  title,
  children,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  accent: string
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-semibold">{title}</span>
            <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {children}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const stack: StackItemProps[] = [
  {
    icon: Layers,
    name: "Next.js",
    version: "16.1",
    category: "Framework",
    description:
      "Full-stack React framework with App Router, server components, and API routes. Handles routing, SSR, static generation, and middleware in one package \u2014 no need to assemble separate tools for each concern.",
    highlights: ["App Router", "API Routes", "Server Components", "Middleware"],
    color: "bg-foreground/[0.06] text-foreground/70",
  },
  {
    icon: KeyRound,
    name: "NextAuth.js v5",
    version: "5.0-beta",
    category: "Authentication",
    description:
      "Auth library built specifically for Next.js. Ships with a first-party Microsoft Entra ID provider \u2014 connecting to corporate SSO takes a single config block with client ID, secret, and issuer URL. No custom OAuth plumbing required.",
    highlights: ["Entra ID in ~10 lines", "Edge-compatible", "Session callbacks", "Route protection"],
    color: "bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  },
  {
    icon: Blocks,
    name: "Zustand",
    version: "5.0",
    category: "State Management",
    description:
      "Minimal state library with no boilerplate \u2014 no providers, reducers, or action types. A single create() call defines the entire store. Components subscribe to individual slices so only what changes re-renders.",
    highlights: ["Zero boilerplate", "No providers", "Selective re-renders", "Tiny bundle (~1KB)"],
    color: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  },
  {
    icon: LayoutTemplate,
    name: "shadcn/ui",
    version: "3.8",
    category: "Component Library",
    description:
      "Copy-paste component system built on Radix UI primitives. Components live in your codebase, not in node_modules \u2014 fully customizable. A major advantage: AI coding assistants like Claude have extensive training data on shadcn patterns, making AI-assisted development extremely productive.",
    highlights: ["AI-friendly patterns", "Owns the code", "Radix primitives", "Tailwind styled"],
    color: "bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  },
  {
    icon: Database,
    name: "Prisma",
    version: "6.19",
    category: "Database ORM",
    description:
      "Type-safe ORM with auto-generated TypeScript client. Schema-first design means the database schema is the single source of truth. Migrations, seeding, and Studio for visual browsing all come built-in.",
    highlights: ["Type-safe queries", "Auto migrations", "SQLite / Postgres", "Prisma Studio"],
    color: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  {
    icon: BarChart3,
    name: "Recharts",
    version: "2.15",
    category: "Data Visualization",
    description:
      "Composable charting library built on D3 and React. Declarative API where each chart element is a React component. Supports Area, Bar, Line, Pie, Radar, Radial, Scatter, Composed, and more.",
    highlights: ["10+ chart types", "Declarative API", "Responsive", "Customizable tooltips"],
    color: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  },
  {
    icon: Paintbrush,
    name: "Tailwind CSS",
    version: "4.0",
    category: "Styling",
    description:
      "Utility-first CSS framework. Tailwind v4 uses a new Rust-based engine that\u0027s significantly faster. Combined with shadcn\u0027s CSS variables, it enables consistent theming with light/dark mode and semantic color tokens throughout.",
    highlights: ["Utility-first", "CSS variables", "Dark mode", "Rust engine (v4)"],
    color: "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400",
  },
  {
    icon: Shield,
    name: "Zod",
    version: "4.3",
    category: "Validation",
    description:
      "TypeScript-first schema validation. Defines runtime validation and static types in one declaration. Used for API request/response validation and form schemas with react-hook-form integration.",
    highlights: ["Runtime + types", "Form integration", "API validation", "Composable schemas"],
    color: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
  },
]

export default function StackPage() {
  return (
    <>
      <Header title="Tech Stack" />
      <div className="flex-1 space-y-3 p-4 lg:p-5">

        {/* Key Insights */}
        <div className="grid gap-3 lg:grid-cols-3">
          <InsightCard
            icon={Zap}
            title="Enterprise Auth in Minutes"
            accent="bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400"
          >
            NextAuth v5 ships a first-party <strong>Microsoft Entra ID provider</strong>.
            The entire auth setup is ~10 lines of config: client ID, secret, issuer URL.
            No custom OAuth flows, no SAML XML, no token handling. Connect to corporate
            SSO in minutes, not days.
          </InsightCard>

          <InsightCard
            icon={BrainCircuit}
            title="AI-Optimized Component Library"
            accent="bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400"
          >
            shadcn/ui has become the de facto standard for React + Tailwind projects.
            AI models like <strong>Claude have extensive training data</strong> on shadcn patterns,
            making them exceptionally productive at generating, modifying, and debugging
            these components. AI writes production-quality shadcn code on the first try.
          </InsightCard>

          <InsightCard
            icon={PackageCheck}
            title="Zero-Config State Management"
            accent="bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          >
            Zustand replaces Redux with a <strong>single function call</strong>.
            No providers wrapping your app, no action creators, no reducers. Components
            subscribe to exactly the state they need. The entire analytics store for this
            app is under 100 lines.
          </InsightCard>
        </div>

        <Separator className="bg-border/50" />

        {/* Stack Grid */}
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mb-2.5">
            Full Stack Breakdown
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {stack.map((item) => (
              <StackCard key={item.name} {...item} />
            ))}
          </div>
        </div>

        <Separator className="bg-border/50" />

        {/* Architecture summary */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">How It All Fits Together</CardTitle>
            <p className="text-xs text-muted-foreground">Request lifecycle from browser to database</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {[
                { label: "Browser", sub: "React 19" },
                { label: "Routing", sub: "App Router" },
                { label: "Auth Gate", sub: "NextAuth Middleware" },
                { label: "UI Layer", sub: "shadcn + Tailwind" },
                { label: "State", sub: "Zustand Store" },
                { label: "API", sub: "Route Handlers" },
                { label: "Validation", sub: "Zod Schemas" },
                { label: "ORM", sub: "Prisma Client" },
                { label: "Database", sub: "SQLite / Postgres" },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-center">
                    <div className="text-[11px] font-semibold">{step.label}</div>
                    <div className="text-[10px] text-muted-foreground">{step.sub}</div>
                  </div>
                  {i < 8 && (
                    <span className="text-muted-foreground/40 text-[10px] font-mono">&rarr;</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
