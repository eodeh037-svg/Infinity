export function calculateCMO(
  closes: number[],
  period: number = 20
): (number | null)[] {
  const results: (number | null)[] = closes.map(() => null)

  if (closes.length <= period) return results

  for (let i = period; i < closes.length; i++) {
    let sumGain = 0
    let sumLoss = 0

    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1]
      if (change > 0) {
        sumGain += change
      } else {
        sumLoss += Math.abs(change)
      }
    }

    if (sumGain + sumLoss === 0) {
      results[i] = 0
    } else {
      results[i] = 100 * (sumGain - sumLoss) / (sumGain + sumLoss)
    }
  }

  return results
}

export function analyzeCMO(
  cmoValues: (number | null)[],
  lastIndex: number
): {
  signal: 'BUY' | 'SELL' | 'NONE'
  strength: number
  momentum: 'increasing' | 'decreasing' | 'flat'
} {
  if (lastIndex < 1 || cmoValues[lastIndex] === null) {
    return { signal: 'NONE', strength: 0, momentum: 'flat' }
  }

  const cmo = cmoValues[lastIndex]!

  let signal: 'BUY' | 'SELL' | 'NONE' = 'NONE'
  if (cmo <= -50) signal = 'BUY'
  else if (cmo >= 50) signal = 'SELL'
  else if (cmo <= -25) signal = 'BUY'
  else if (cmo >= 25) signal = 'SELL'

  const strength = Math.abs(cmo) / 100

  let momentum: 'increasing' | 'decreasing' | 'flat' = 'flat'
  if (lastIndex >= 1 && cmoValues[lastIndex - 1] !== null) {
    const prev = cmoValues[lastIndex - 1]!
    const diff = cmo - prev
    if (diff > 5) momentum = 'increasing'
    else if (diff < -5) momentum = 'decreasing'
  }

  return { signal, strength, momentum }
}
