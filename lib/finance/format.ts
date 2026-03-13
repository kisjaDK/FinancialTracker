const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "DKK",
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

export function formatNumber(value: number) {
  return numberFormatter.format(value)
}

export function formatPercent(value: number) {
  const normalized = Number(value)
  return `${numberFormatter.format(Number.isFinite(normalized) ? normalized * 100 : 0)}%`
}

export function formatFteAsPercent(value: number) {
  const normalized = Number(value)

  if (!Number.isFinite(normalized)) {
    return "0%"
  }

  const percent = normalized <= 1 ? normalized * 100 : normalized
  return `${numberFormatter.format(percent)}%`
}
