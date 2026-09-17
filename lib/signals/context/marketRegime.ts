import { SignalResult } from '../signalEngine'
import { MarketTrendRegime, TrendStrength, TrendRegimeResult } from './types'

export function detectTrendRegime(result: SignalResult): TrendRegimeResult {
  const evidence: string[] = []
  let bullishPoints = 0
  let bearishPoints = 0

  const ema20 = result.ema20
  const ema50 = result.ema50
  const adx = result.adx
  const plusDI = result.plusDI
  const minusDI = result.minusDI
  const supertrendDir = result.supertrendDirection
  const entry = result.entry

  if (ema20 === null || ema50 === null) {
    return {
      regime: 'unclear',
      strength: 'weak',
      evidence: ['Insufficient EMA data for regime classification'],
      coverage: 'partial',
    }
  }

  // EMA alignment
  if (entry > ema20 && ema20 > ema50) {
    bullishPoints += 2
    evidence.push('EMA alignment bullish (price > EMA20 > EMA50)')
  } else if (entry < ema20 && ema20 < ema50) {
    bearishPoints += 2
    evidence.push('EMA alignment bearish (price < EMA20 < EMA50)')
  } else if (entry > ema50) {
    bullishPoints += 1
    evidence.push('Price above EMA50')
  } else if (entry < ema50) {
    bearishPoints += 1
    evidence.push('Price below EMA50')
  }

  // ADX directional consensus
  if (adx !== null && plusDI !== null && minusDI !== null) {
    if (adx >= 25) {
      if (plusDI > minusDI) {
        bullishPoints += 1
        evidence.push(`ADX confirms bullish direction (ADX ${adx.toFixed(1)}, +DI > -DI)`)
      } else {
        bearishPoints += 1
        evidence.push(`ADX confirms bearish direction (ADX ${adx.toFixed(1)}, -DI > +DI)`)
      }
    }
  }

  // Supertrend
  if (supertrendDir === 'UP') {
    bullishPoints += 1
    evidence.push('Supertrend remains bullish')
  } else if (supertrendDir === 'DOWN') {
    bearishPoints += 1
    evidence.push('Supertrend remains bearish')
  }

  // RSI position as secondary confirmation
  if (result.rsi !== null) {
    if (result.rsi > 55) {
      bullishPoints += 1
      evidence.push(`RSI above midpoint (${result.rsi.toFixed(1)})`)
    } else if (result.rsi < 45) {
      bearishPoints += 1
      evidence.push(`RSI below midpoint (${result.rsi.toFixed(1)})`)
    }
  }

  // Classify regime
  const netPoints = bullishPoints - bearishPoints
  const totalPoints = bullishPoints + bearishPoints

  let regime: MarketTrendRegime
  let strength: TrendStrength

  if (totalPoints === 0) {
    regime = 'unclear'
    strength = 'weak'
  } else if (netPoints >= 3) {
    regime = 'uptrend'
    strength = classifyStrength(adx, totalPoints, netPoints)
  } else if (netPoints <= -3) {
    regime = 'downtrend'
    strength = classifyStrength(adx, totalPoints, Math.abs(netPoints))
  } else if (netPoints >= 1 && totalPoints >= 3) {
    regime = 'uptrend'
    strength = 'weak'
    evidence.push('Mixed signals lean bullish')
  } else if (netPoints <= -1 && totalPoints >= 3) {
    regime = 'downtrend'
    strength = 'weak'
    evidence.push('Mixed signals lean bearish')
  } else {
    regime = 'range'
    strength = adx !== null && adx < 20 ? 'moderate' : 'weak'
    if (adx !== null && adx < 20) {
      evidence.push(`Low ADX (${adx.toFixed(1)}) suggests ranging market`)
    } else {
      evidence.push('Insufficient directional conviction for trend classification')
    }
  }

  return {
    regime,
    strength,
    evidence,
    coverage: 'full',
  }
}

function classifyStrength(
  adx: number | null,
  totalPoints: number,
  netPoints: number
): TrendStrength {
  const dominance = totalPoints > 0 ? netPoints / totalPoints : 0

  if (adx !== null && adx >= 30 && dominance >= 0.6) return 'strong'
  if (adx !== null && adx >= 22 && dominance >= 0.4) return 'moderate'
  if (dominance >= 0.5) return 'moderate'
  return 'weak'
}
