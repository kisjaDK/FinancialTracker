import { redirect } from "next/navigation"

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | string[] | undefined
) {
  if (Array.isArray(value)) {
    value.forEach((entry) => params.append(key, entry))
    return
  }

  if (value) {
    params.set(key, value)
  }
}

export default async function ExternalActualsRedirectPage({
  searchParams,
}: PageProps) {
  const resolvedSearchParams = await searchParams
  const nextParams = new URLSearchParams()

  Object.entries(resolvedSearchParams ?? {}).forEach(([key, value]) => {
    appendParam(nextParams, key, value)
  })

  const query = nextParams.toString()
  redirect(query ? `/actuals?${query}` : "/actuals")
}
