import { FinanceAppShell } from "@/components/finance/app-shell";
import { RosterImportsBrowser } from "@/components/finance/roster-imports-browser";
import { requirePageAccess } from "@/lib/authz";
import { getPeopleRosterImportsPageData } from "@/lib/finance/queries";

type PageProps = {
  searchParams?: Promise<{
    year?: string;
  }>;
};

export default async function PeopleRosterImportsPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;
  const data = await getPeopleRosterImportsPageData(year);

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/people-roster"
    >
      <RosterImportsBrowser
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        rosterImports={data.rosterImports}
        backHref={`/people-roster?year=${data.activeYear}`}
      />
    </FinanceAppShell>
  );
}
