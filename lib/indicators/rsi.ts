export function calculateRSI(
  closes: number[],
  period = 14
): (number | null)[] {
  if (period <= 0) {
    throw new Error('RSI period must be greater than 0')
  }

  const result: (number | null)[] =
    new Array(closes.length).fill(null)

  if (closes.length <= period) {
    return result
  }

  let gainSum = 0
  let lossSum = 0

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]

    if (change > 0) {
      gainSum += change
    } else {
      lossSum += Math.abs(change)
    }
  }

  let averageGain = gainSum / period
  let averageLoss = lossSum / period

  result[period] = calculateRSIValue(
    averageGain,
    averageLoss
  )

  // Wilder smoothing
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]

    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)

    averageGain =
      ((averageGain * (period - 1)) + gain) / period

    averageLoss =
      ((averageLoss * (period - 1)) + loss) / period

    result[i] = calculateRSIValue(
      averageGain,
      averageLoss
    )
  }

  return result
}

function calculateRSIValue(
  averageGain: number,
  averageLoss: number
): number {
  if (averageLoss === 0) {
    return 100
  }

  if (averageGain === 0) {
    return 0
  }

  const relativeStrength =
    averageGain / averageLoss

  return 100 - 100 / (1 + relativeStrength)
}
