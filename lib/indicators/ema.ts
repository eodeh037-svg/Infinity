export function calculateEMA(
  values: number[],
  period: number
): (number | null)[] {
  if (period <= 0) {
    throw new Error('EMA period must be greater than 0')
  }

  if (values.length === 0) {
    return []
  }

  if (values.length < period) {
    return values.map(() => null)
  }

  const result: (number | null)[] = new Array(values.length).fill(null)
  const multiplier = 2 / (period + 1)

  let sum = 0

  for (let i = 0; i < period; i++) {
    sum += values[i]
  }

  let previousEMA = sum / period
  result[period - 1] = previousEMA

  for (let i = period; i < values.length; i++) {
    const currentEMA =
      (values[i] - previousEMA) * multiplier + previousEMA

    result[i] = currentEMA
    previousEMA = currentEMA
  }

  return result
}
