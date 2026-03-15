import type { CurrencyCode, ExchangeRate } from "@prisma/client"

export type ExchangeRateLookup = Map<CurrencyCode, ExchangeRate | null>

export function buildExchangeRateLookup(rates: ExchangeRate[]) {
  const lookup: ExchangeRateLookup = new Map([
    ["DKK", null],
    ["EUR", null],
    ["USD", null],
  ])

  for (const rate of rates) {
    const current = lookup.get(rate.currency)
    if (!current || current.effectiveDate < rate.effectiveDate) {
      lookup.set(rate.currency, rate)
    }
  }

  return lookup
}

export function findClosestPriorExchangeRate(
  currency: CurrencyCode,
  rates: ExchangeRate[],
  effectiveOn: Date
) {
  if (currency === "DKK") {
    return null
  }

  let closestRate: ExchangeRate | null = null

  for (const rate of rates) {
    if (rate.currency !== currency) {
      continue
    }

    if (rate.effectiveDate > effectiveOn) {
      continue
    }

    if (!closestRate || closestRate.effectiveDate < rate.effectiveDate) {
      closestRate = rate
    }
  }

  return closestRate
}

export function convertAmountToDkk(
  amount: number,
  currency: CurrencyCode,
  exchangeRates: ExchangeRateLookup
) {
  if (currency === "DKK") {
    return {
      amountDkk: amount,
      exchangeRateUsed: 1,
    }
  }

  const rate = exchangeRates.get(currency)
  if (!rate) {
    throw new Error(`No exchange rate available for ${currency}.`)
  }

  return {
    amountDkk: amount * rate.rateToDkk,
    exchangeRateUsed: rate.rateToDkk,
  }
}
