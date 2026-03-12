import { redirect } from "next/navigation"

type PageProps = {
  searchParams?: Promise<{
    year?: string
  }>
}

export default async function StatusesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
  redirect(year ? `/admin?year=${year}` : "/admin")
}
