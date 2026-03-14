import { redirect } from "next/navigation"

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function buildSearch(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams()

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((entry) => params.append(key, entry))
      return
    }

    if (value) {
      params.set(key, value)
    }
  })

  const query = params.toString()
  return query ? `/tracker?${query}` : "/tracker"
}

export default async function WelcomePage({ searchParams }: PageProps) {
  redirect(buildSearch((await searchParams) ?? {}))
}
