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
  return `${numberFormatter.format(value * 100)}%`
}
