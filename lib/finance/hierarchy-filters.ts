type HierarchyRow = {
  domain: string | null | undefined
  subDomain: string | null | undefined
  team: string | null | undefined
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function collectSortedValues(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right))
}

function matchesSelection(
  value: string | null | undefined,
  selectedValues: string[]
) {
  if (selectedValues.length === 0) {
    return true
  }

  const normalized = normalizeValue(value)
  return selectedValues.some((selectedValue) => normalizeValue(selectedValue) === normalized)
}

export function buildCascadingHierarchyOptions(
  rows: HierarchyRow[],
  selectedDomains: string[],
  selectedSubDomains: string[]
) {
  const subDomains = collectSortedValues(
    rows
      .filter((row) => matchesSelection(row.domain, selectedDomains))
      .map((row) => row.subDomain)
  )

  const teams = collectSortedValues(
    rows
      .filter((row) => matchesSelection(row.domain, selectedDomains))
      .filter((row) => matchesSelection(row.subDomain, selectedSubDomains))
      .map((row) => row.team)
  )

  return {
    subDomains,
    teams,
  }
}

export function pruneInvalidSelections(
  selectedValues: string[],
  allowedValues: string[]
) {
  const allowedSet = new Set(allowedValues.map((value) => normalizeValue(value)))
  return selectedValues.filter((value) => allowedSet.has(normalizeValue(value)))
}
