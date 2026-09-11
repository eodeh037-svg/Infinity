import { Candle } from '../indicators/types'
import { calculateEMA } from '../indicators/ema'
import { calculateRSI } from '../indicators/rsi'
import { calculateMACD } from '../indicators/macd'
import { calculateATR } from '../indicators/atr'
import { calculateADX } from '../indicators/adx'
import { calculateBollinger, detectBollingerSqueeze } from '../indicators/bollinger'
import { calculateStochastic } from '../indicators/stochastic'
import { calculateIchimoku, getCloudAtCandle } from '../indicators/ichimoku'
import { calculateWilliamsR, WilliamsRResult } from '../indicators/williamsR'

export type Signal = 'BUY' | 'SELL' | 'HOLD'

export type SignalResult = {
  signal: Signal
  entry: number
  stopLoss: number | null
  takeProfit: number | null
  riskReward: number | null
  ema20: number | null
  ema50: number | null
  rsi: number | null
  macd: {
    macd: number | null
    signal: number | null
    histogram: number | null
  }
  atr: number | null
  adx: number | null
  plusDI: number | null
  minusDI: number | null
  stochK: number | null
  stochD: number | null
  bbUpper: number | null
  bbLower: number | null
  bbWidth: number | null
  ichimokuCloud: boolean | null
  confidence: number
  reasons: string[]
  output: string
}

const MIN_CANDLES = 200
const SWING_LOOKBACK = 60
const MOMENTUM_LOOKBACK = 3
const PIP_VALUE = 0.0001
const RISK_PERCENT = 0.02

const ATR_SL_MULTIPLIER = 1.5
const ATR_BUFFER = 0.30
const BASE_RISK_REWARD = 2.0
const VOLATILITY_RR_ADJUSTMENT = 0.5
const TREND_RR_BONUS = 0.3
const CONFIDENCE_RR_SCALING = 0.4

const HOLD_SCORE_GAP = 3
const MIN_DIRECTIONAL_SCORE = 10

const MAX_CONFIDENCE = 95
const MIN_CONFIDENCE = 35

export function generateSignal(
  candles: Candle[],
  accountSize: number = 0
): SignalResult {
  const entry = candles[candles.length - 1]?.close ?? 0

  const emptyIndicators = {
    ema20: null,
    ema50: null,
    rsi: null,
    macd: { macd: null, signal: null, histogram: null },
    atr: null,
    adx: null,
    plusDI: null,
    minusDI: null,
    stochK: null,
    stochD: null,
    bbUpper: null,
    bbLower: null,
    bbWidth: null,
    ichimokuCloud: null,
  }

  if (!entry || candles.length < MIN_CANDLES) {
    return createResult(
      'HOLD', entry, null, null, null,
      emptyIndicators, 0,
      ['Insufficient market data for reliable analysis']
    )
  }

  const closes = candles.map(c => c.close)

  const ema20Values = calculateEMA(closes, 20)
  const ema50Values = calculateEMA(closes, 50)
  const ema200Values = calculateEMA(closes, 200)
  const rsiValues = calculateRSI(closes, 14)
  const macdValues = calculateMACD(closes, 12, 26, 9)
  const atrValues = calculateATR(candles, 14)
  const adxResults = calculateADX(candles, 14)
  const bollingerResults = calculateBollinger(closes, 20, 2)
  const stochasticResults = calculateStochastic(candles, 14, 3, 3)
  const ichimokuResults = calculateIchimoku(candles)
  const williamsRValues = calculateWilliamsR(candles, 14)

  const lastIndex = candles.length - 1

  const ema20 = ema20Values[lastIndex] ?? null
  const ema50 = ema50Values[lastIndex] ?? null
  const ema200 = ema200Values[lastIndex] ?? null
  const rsi = rsiValues[lastIndex] ?? null
  const macd = macdValues[lastIndex] ?? { macd: null, signal: null, histogram: null }
  const atr = atrValues[lastIndex] ?? null
  const adxResult = adxResults[lastIndex] ?? { adx: null, plusDI: null, minusDI: null }
  const bb = bollingerResults[lastIndex] ?? { upper: null, middle: null, lower: null, width: null }
  const stoch = stochasticResults[lastIndex] ?? { k: null, d: null }
  const ichimoku = ichimokuResults[lastIndex] ?? { tenkan: null, kijun: null, senkouA: null, senkouB: null, chikou: null }
  const williamsR = williamsRValues[lastIndex] ?? { value: null }

  const cloudData = getCloudAtCandle(ichimokuResults, lastIndex, 26)
  const priceAboveCloud = cloudData.senkouA !== null && cloudData.senkouB !== null && entry > Math.max(cloudData.senkouA, cloudData.senkouB)
  const priceBelowCloud = cloudData.senkouA !== null && cloudData.senkouB !== null && entry < Math.min(cloudData.senkouA, cloudData.senkouB)

  if (
    ema20 === null || ema50 === null || rsi === null || atr === null || atr <= 0 ||
    macd.macd === null || macd.signal === null || macd.histogram === null
  ) {
    return createResult(
      'HOLD', entry, null, null, null,
      {
        ema20, ema50, rsi, macd, atr,
        adx: adxResult.adx, plusDI: adxResult.plusDI, minusDI: adxResult.minusDI,
        stochK: stoch.k, stochD: stoch.d,
        bbUpper: bb.upper, bbLower: bb.lower, bbWidth: bb.width,
        ichimokuCloud: priceAboveCloud || priceBelowCloud ? true : null,
      },
      0, ['Indicators could not be fully calculated']
    )
  }

  let buyScore = 0
  let sellScore = 0
  const buyReasons: string[] = []
  const sellReasons: string[] = []

  const addBuy = (score: number, reason: string) => { buyScore += score; buyReasons.push(reason) }
  const addSell = (score: number, reason: string) => { sellScore += score; sellReasons.push(reason) }

  const adxValue = adxResult.adx ?? 0
  const isTrending = adxValue >= 22
  const isRanging = adxValue < 20
  const isStrongTrend = adxValue >= 30

  if (adxValue > 0) {
    if (isStrongTrend) {
      if (adxResult.plusDI !== null && adxResult.minusDI !== null && adxResult.plusDI > adxResult.minusDI) {
        addBuy(3, `Strong bullish trend (ADX ${adxValue.toFixed(1)}, +DI ${adxResult.plusDI.toFixed(1)} > -DI ${adxResult.minusDI.toFixed(1)})`)
      } else if (adxResult.plusDI !== null && adxResult.minusDI !== null) {
        addSell(3, `Strong bearish trend (ADX ${adxValue.toFixed(1)}, -DI ${adxResult.minusDI.toFixed(1)} > +DI ${adxResult.plusDI.toFixed(1)})`)
      }
    } else if (isTrending) {
      if (adxResult.plusDI !== null && adxResult.minusDI !== null && adxResult.plusDI > adxResult.minusDI) {
        addBuy(2, `Trend favors bulls (ADX ${adxValue.toFixed(1)})`)
      } else if (adxResult.plusDI !== null && adxResult.minusDI !== null) {
        addSell(2, `Trend favors bears (ADX ${adxValue.toFixed(1)})`)
      }
    } else if (adxValue >= 20) {
      if (adxResult.plusDI !== null && adxResult.minusDI !== null && adxResult.plusDI > adxResult.minusDI) {
        addBuy(1, `Mild bullish bias (ADX ${adxValue.toFixed(1)})`)
      } else if (adxResult.plusDI !== null && adxResult.minusDI !== null) {
        addSell(1, `Mild bearish bias (ADX ${adxValue.toFixed(1)})`)
      }
    }
  }

  const ema20Slope = calculateSlope(ema20Values, lastIndex, 5)
  const ema50Slope = calculateSlope(ema50Values, lastIndex, 5)

  if (entry > ema20 && ema20 > ema50) {
    addBuy(3, 'Price above EMA20 above EMA50 (bullish alignment)')
  } else if (entry < ema20 && ema20 < ema50) {
    addSell(3, 'Price below EMA20 below EMA50 (bearish alignment)')
  } else if (entry > ema50) {
    addBuy(1, 'Price above EMA50')
  } else {
    addSell(1, 'Price below EMA50')
  }

  if (ema20Slope > 0 && ema50Slope > 0) {
    addBuy(2, 'Both EMA20 and EMA50 trending upward')
  } else if (ema20Slope < 0 && ema50Slope < 0) {
    addSell(2, 'Both EMA20 and EMA50 trending downward')
  }

  if (ema200 !== null) {
    if (entry > ema200 && ema20 !== null && ema20 > ema200) {
      addBuy(2, 'Price above EMA200 (long-term bullish)')
    } else if (entry < ema200 && ema20 !== null && ema20 < ema200) {
      addSell(2, 'Price below EMA200 (long-term bearish)')
    }
  }

  const structure = analyzeMarketStructure(candles, lastIndex)

  if (structure === 'BULLISH') {
    addBuy(3, 'Market structure: higher highs and higher lows')
  } else if (structure === 'BEARISH') {
    addSell(3, 'Market structure: lower highs and lower lows')
  }

  const momentum = analyzeMomentum(rsiValues, macdValues, ema20Values, lastIndex)

  if (rsi !== null) {
    if (isTrending) {
      if (rsi >= 50 && rsi < 75) {
        addBuy(2, `RSI confirms bullish momentum (${rsi.toFixed(1)})`)
      } else if (rsi > 25 && rsi <= 50) {
        addSell(2, `RSI confirms bearish momentum (${rsi.toFixed(1)})`)
      } else if (rsi >= 75) {
        addSell(1, `RSI overbought in trend (${rsi.toFixed(1)}) — potential reversal`)
      } else if (rsi <= 25) {
        addBuy(1, `RSI oversold in trend (${rsi.toFixed(1)}) — potential reversal`)
      }
    } else {
      if (rsi <= 30) {
        addBuy(3, `RSI oversold in range (${rsi.toFixed(1)}) — mean reversion`)
      } else if (rsi >= 70) {
        addSell(3, `RSI overbought in range (${rsi.toFixed(1)}) — mean reversion`)
      } else if (rsi < 45) {
        addBuy(1, `RSI leaning bearish zone (${rsi.toFixed(1)})`)
      } else if (rsi > 55) {
        addSell(1, `RSI leaning bullish zone (${rsi.toFixed(1)})`)
      }
    }
  }

  const macdDiff = macd.macd - macd.signal
  const macdThreshold = atr * 0.001
  if (macdDiff > macdThreshold) {
    addBuy(2, 'MACD above signal line')
  } else if (macdDiff < -macdThreshold) {
    addSell(2, 'MACD below signal line')
  }

  const previousMacd = macdValues[lastIndex - 1]
  if (previousMacd?.macd !== null && previousMacd?.signal !== null) {
    if (previousMacd.macd <= previousMacd.signal && macd.macd > macd.signal) {
      addBuy(2, 'Fresh bullish MACD crossover')
    }
    if (previousMacd.macd >= previousMacd.signal && macd.macd < macd.signal) {
      addSell(2, 'Fresh bearish MACD crossover')
    }
  }

  if (momentum.histogramGrowing) {
    if (macd.histogram > 0) {
      addBuy(2, 'Bullish MACD momentum expanding')
    } else {
      addSell(2, 'Bearish MACD momentum expanding')
    }
  }

  const macdDivergence = detectMACDDivergence(candles, macdValues, lastIndex)
  if (macdDivergence === 'BULLISH') {
    addBuy(2, 'Bullish MACD divergence detected')
  } else if (macdDivergence === 'BEARISH') {
    addSell(2, 'Bearish MACD divergence detected')
  }

  if (momentum.rsiRising) {
    addBuy(1, 'RSI momentum rising')
  } else if (momentum.rsiFalling) {
    addSell(1, 'RSI momentum falling')
  }

  const hasMomentumConflict =
    (momentum.rsiRising && macd.histogram !== null && macd.histogram < 0) ||
    (momentum.rsiFalling && macd.histogram !== null && macd.histogram > 0)
  if (hasMomentumConflict) {
    if (momentum.rsiRising) {
      addSell(1, 'Momentum conflict: RSI rising but MACD histogram negative')
    } else {
      addBuy(1, 'Momentum conflict: RSI falling but MACD histogram positive')
    }
  }

  const trendStrength = analyzeTrendStrength(ema20, ema50, entry, atr)
  if (trendStrength.strong) {
    if (trendStrength.bullish) {
      addBuy(1, `Strong EMA trend separation (${trendStrength.gapPercent.toFixed(2)}%)`)
    } else {
      addSell(1, `Strong bearish EMA separation (${trendStrength.gapPercent.toFixed(2)}%)`)
    }
  }

  if (stoch.k !== null && stoch.d !== null) {
    if (isRanging) {
      if (stoch.k < 20 && stoch.k > stoch.d) {
        addBuy(3, `Stochastic oversold crossover (K=${stoch.k.toFixed(1)}, D=${stoch.d.toFixed(1)})`)
      } else if (stoch.k > 80 && stoch.k < stoch.d) {
        addSell(3, `Stochastic overbought crossover (K=${stoch.k.toFixed(1)}, D=${stoch.d.toFixed(1)})`)
      } else if (stoch.k < 30) {
        addBuy(1, `Stochastic near oversold (${stoch.k.toFixed(1)})`)
      } else if (stoch.k > 70) {
        addSell(1, `Stochastic near overbought (${stoch.k.toFixed(1)})`)
      }
    } else {
      if (stoch.k > 50 && stoch.k > stoch.d) {
        addBuy(1, `Stochastic bullish in trend (K=${stoch.k.toFixed(1)})`)
      } else if (stoch.k < 50 && stoch.k < stoch.d) {
        addSell(1, `Stochastic bearish in trend (K=${stoch.k.toFixed(1)})`)
      }
    }
  }

  if (bb.upper !== null && bb.lower !== null && bb.middle !== null) {
    if (isRanging) {
      if (entry <= bb.lower) {
        addBuy(3, 'Price at lower Bollinger Band — mean reversion')
      } else if (entry >= bb.upper) {
        addSell(3, 'Price at upper Bollinger Band — mean reversion')
      } else if (entry < bb.middle) {
        addBuy(1, 'Price below Bollinger midline')
      } else {
        addSell(1, 'Price above Bollinger midline')
      }
    } else if (isTrending) {
      if (entry > bb.upper) {
        addBuy(2, 'Price riding upper band — strong bullish trend')
      } else if (entry < bb.lower) {
        addSell(2, 'Price riding lower band — strong bearish trend')
      }
    }
  }

  const bbSqueeze = detectBollingerSqueeze(bollingerResults)
  if (bbSqueeze.isSqueeze && bbSqueeze.squeezeIntensity > 0.3) {
    if (structure === 'BULLISH' || (ema20 !== null && ema50 !== null && ema20 > ema50)) {
      addBuy(1, `Bollinger squeeze with bullish bias — breakout imminent`)
    } else if (structure === 'BEARISH' || (ema20 !== null && ema50 !== null && ema20 < ema50)) {
      addSell(1, `Bollinger squeeze with bearish bias — breakout imminent`)
    }
  }

  if (priceAboveCloud) {
    addBuy(2, 'Price above Ichimoku cloud — bullish')
  } else if (priceBelowCloud) {
    addSell(2, 'Price below Ichimoku cloud — bearish')
  }

  if (ichimoku.tenkan !== null && ichimoku.kijun !== null) {
    const prevIchimoku = ichimokuResults[lastIndex - 1]
    if (prevIchimoku?.tenkan !== null && prevIchimoku?.kijun !== null) {
      if (prevIchimoku.tenkan <= prevIchimoku.kijun && ichimoku.tenkan > ichimoku.kijun) {
        addBuy(2, 'Ichimoku TK cross (bullish)')
      } else if (prevIchimoku.tenkan >= prevIchimoku.kijun && ichimoku.tenkan < ichimoku.kijun) {
        addSell(2, 'Ichimoku TK cross (bearish)')
      }
    }
  }

  if (ichimoku.chikou !== null && lastIndex >= 26) {
    const price26Ago = candles[lastIndex - 26].close
    if (ichimoku.chikou > price26Ago) {
      addBuy(1, 'Chikou span above price — bullish confirmation')
    } else if (ichimoku.chikou < price26Ago) {
      addSell(1, 'Chikou span below price — bearish confirmation')
    }
  }

  if (williamsR.value !== null) {
    if (isRanging) {
      if (williamsR.value <= -80) {
        addBuy(2, `Williams %R oversold (${williamsR.value.toFixed(1)})`)
      } else if (williamsR.value >= -20) {
        addSell(2, `Williams %R overbought (${williamsR.value.toFixed(1)})`)
      }
    } else {
      if (williamsR.value > -50 && williamsR.value < -20) {
        addBuy(1, `Williams %R bullish momentum (${williamsR.value.toFixed(1)})`)
      } else if (williamsR.value < -50 && williamsR.value > -80) {
        addSell(1, `Williams %R bearish momentum (${williamsR.value.toFixed(1)})`)
      }
    }
  }

  const fibonacci = calculateFibonacciLevels(candles, lastIndex, signalFromScores(buyScore, sellScore))
  if (fibonacci.nearestLevel !== null) {
    const distToLevel = Math.abs(entry - fibonacci.nearestLevel) / entry
    if (distToLevel < 0.002) {
      if (fibonacci.levelType === 'support') {
        addBuy(1, `Price near Fibonacci ${fibonacci.levelName} support`)
      } else {
        addSell(1, `Price near Fibonacci ${fibonacci.levelName} resistance`)
      }
    }
  }

  const divergence = detectDivergence(candles, rsiValues, lastIndex)
  if (divergence === 'BULLISH') {
    addBuy(2, 'Bullish RSI divergence detected')
  } else if (divergence === 'BEARISH') {
    addSell(2, 'Bearish RSI divergence detected')
  }

  const priceAction = analyzePriceAction(candles, lastIndex)
  if (priceAction.bullishEngulfing) {
    addBuy(2, 'Bullish engulfing candle pattern')
  }
  if (priceAction.bearishEngulfing) {
    addSell(2, 'Bearish engulfing candle pattern')
  }
  if (priceAction.hammer) {
    addBuy(2, 'Hammer candle pattern — potential reversal')
  }
  if (priceAction.shootingStar) {
    addSell(2, 'Shooting star pattern — potential reversal')
  }
  if (priceAction.doji) {
    if (structure === 'BULLISH') {
      addBuy(1, 'Doji in bullish structure — continuation hint')
    } else if (structure === 'BEARISH') {
      addSell(1, 'Doji in bearish structure — continuation hint')
    }
  }
  if (priceAction.bullishHarami) {
    addBuy(1, 'Bullish harami pattern')
  }
  if (priceAction.bearishHarami) {
    addSell(1, 'Bearish harami pattern')
  }
  if (priceAction.morningStar) {
    addBuy(2, 'Morning star pattern — bullish reversal')
  }
  if (priceAction.eveningStar) {
    addSell(2, 'Evening star pattern — bearish reversal')
  }

  const sessionQuality = analyzeSession()
  const sessionMultiplier = sessionQuality.multiplier

  const totalScore = buyScore + sellScore
  const scoreDifference = Math.abs(buyScore - sellScore)

  let signal: Signal

  if (
    scoreDifference <= HOLD_SCORE_GAP &&
    Math.max(buyScore, sellScore) < MIN_DIRECTIONAL_SCORE
  ) {
    signal = 'HOLD'
  } else {
    signal = buyScore >= sellScore ? 'BUY' : 'SELL'
  }

  let confidence = calculateConfidence(
    buyScore, sellScore, signal, trendStrength, structure,
    rsi, macd.histogram, adxValue, sessionMultiplier
  )

  if (signal === 'HOLD') {
    return createResult(
      'HOLD', entry, null, null, null,
      {
        ema20, ema50, rsi, macd, atr,
        adx: adxResult.adx, plusDI: adxResult.plusDI, minusDI: adxResult.minusDI,
        stochK: stoch.k, stochD: stoch.d,
        bbUpper: bb.upper, bbLower: bb.lower, bbWidth: bb.width,
        ichimokuCloud: priceAboveCloud || priceBelowCloud ? true : null,
      },
      Math.round(confidence),
      [
        'Market direction is currently mixed',
        'No side has a strong enough advantage',
        ...selectHoldReasons(buyReasons, sellReasons),
      ]
    )
  }

  const reasons = signal === 'BUY' ? buyReasons : sellReasons

  const structureStart = Math.max(0, lastIndex - SWING_LOOKBACK)
  const structureCandles = candles.slice(structureStart, lastIndex)
  const recentLow = Math.min(...structureCandles.map(c => c.low))
  const recentHigh = Math.max(...structureCandles.map(c => c.high))

  let stopLoss: number

  if (signal === 'BUY') {
    const structuralStop = recentLow - atr * ATR_BUFFER
    const volatilityStop = entry - atr * ATR_SL_MULTIPLIER
    const emaStop = (ema50 ?? entry) - atr * 0.5
    const tightestStop = Math.max(structuralStop, volatilityStop, emaStop)
    stopLoss = Math.max(tightestStop, entry - atr * 3)
  } else {
    const structuralStop = recentHigh + atr * ATR_BUFFER
    const volatilityStop = entry + atr * ATR_SL_MULTIPLIER
    const emaStop = (ema50 ?? entry) + atr * 0.5
    const tightestStop = Math.min(structuralStop, volatilityStop, emaStop)
    stopLoss = Math.min(tightestStop, entry + atr * 3)
  }

  if (accountSize > 0) {
    const maxRiskDollars = accountSize * RISK_PERCENT
    const slDistance = Math.abs(entry - stopLoss)
    const slPips = slDistance / PIP_VALUE
    const maxPipsForMicro = Math.floor(maxRiskDollars / 0.10)

    if (slPips > maxPipsForMicro && maxPipsForMicro > 0) {
      const cappedPips = Math.max(maxPipsForMicro, 5)
      stopLoss = signal === 'BUY'
        ? entry - (cappedPips * PIP_VALUE)
        : entry + (cappedPips * PIP_VALUE)
    }
  }

  const risk = Math.abs(entry - stopLoss)

  if (!Number.isFinite(risk) || risk <= 0) {
    return createResult(
      signal, entry, null, null, null,
      {
        ema20, ema50, rsi, macd, atr,
        adx: adxResult.adx, plusDI: adxResult.plusDI, minusDI: adxResult.minusDI,
        stochK: stoch.k, stochD: stoch.d,
        bbUpper: bb.upper, bbLower: bb.lower, bbWidth: bb.width,
        ichimokuCloud: priceAboveCloud || priceBelowCloud ? true : null,
      },
      Math.round(confidence),
      [...reasons, 'Unable to calculate valid risk']
    )
  }

  const dynamicRiskReward = calculateDynamicRiskReward(atr, entry, trendStrength, signal, confidence, risk)

  const minimumTarget = risk * dynamicRiskReward.min
  const preferredTarget = risk * dynamicRiskReward.preferred
  const maximumTarget = risk * dynamicRiskReward.max
  const atrTarget = atr * dynamicRiskReward.atrMultiplier
  const minimumDistance = Math.max(minimumTarget, atr * 1.5)

  const targetLevels = signal === 'BUY'
    ? findResistanceLevels(candles, entry, lastIndex)
    : findSupportLevels(candles, entry, lastIndex)

  let takeProfit: number

  if (signal === 'BUY') {
    const validTargets = targetLevels.filter(level => (level - entry) >= minimumDistance)
    const preferredTargets = validTargets.filter(level => (level - entry) >= preferredTarget)

    if (preferredTargets.length > 0) {
      takeProfit = Math.min(...preferredTargets)
      reasons.push('TP aligned with resistance')
    } else if (validTargets.length > 0) {
      takeProfit = Math.min(...validTargets)
      reasons.push('TP aligned with market structure')
    } else {
      takeProfit = entry + Math.max(atrTarget, preferredTarget)
      reasons.push('TP calculated using ATR')
    }
  } else {
    const validTargets = targetLevels.filter(level => (entry - level) >= minimumDistance)
    const preferredTargets = validTargets.filter(level => (entry - level) >= preferredTarget)

    if (preferredTargets.length > 0) {
      takeProfit = Math.max(...preferredTargets)
      reasons.push('TP aligned with support')
    } else if (validTargets.length > 0) {
      takeProfit = Math.max(...validTargets)
      reasons.push('TP aligned with market structure')
    } else {
      takeProfit = entry - Math.max(atrTarget, preferredTarget)
      reasons.push('TP calculated using ATR')
    }
  }

  if (signal === 'BUY' && takeProfit <= entry) {
    takeProfit = entry + Math.max(preferredTarget, atrTarget)
  }
  if (signal === 'SELL' && takeProfit >= entry) {
    takeProfit = entry - Math.max(preferredTarget, atrTarget)
  }

  const reward = Math.abs(takeProfit - entry)
  const riskReward = risk > 0 ? reward / risk : null

  if (riskReward !== null && riskReward < dynamicRiskReward.min) {
    confidence *= 0.75
    reasons.push(`R:R below preferred (${riskReward.toFixed(2)})`)
  } else if (riskReward !== null && riskReward >= dynamicRiskReward.preferred) {
    confidence = Math.min(confidence + 5, MAX_CONFIDENCE)
    reasons.push(`Strong R:R ratio (${riskReward.toFixed(2)})`)
  }

  confidence = Math.round(Math.min(Math.max(confidence, MIN_CONFIDENCE), MAX_CONFIDENCE))

  return createResult(
    signal, entry, stopLoss, takeProfit, riskReward,
    {
      ema20, ema50, rsi, macd, atr,
      adx: adxResult.adx, plusDI: adxResult.plusDI, minusDI: adxResult.minusDI,
      stochK: stoch.k, stochD: stoch.d,
      bbUpper: bb.upper, bbLower: bb.lower, bbWidth: bb.width,
      ichimokuCloud: priceAboveCloud || priceBelowCloud ? true : null,
    },
    confidence,
    reasons.slice(0, 10)
  )
}

function signalFromScores(buyScore: number, sellScore: number): 'BUY' | 'SELL' {
  return buyScore >= sellScore ? 'BUY' : 'SELL'
}

function calculateFibonacciLevels(
  candles: Candle[],
  lastIndex: number,
  signal: 'BUY' | 'SELL'
): { nearestLevel: number | null; levelName: string; levelType: 'support' | 'resistance' } {
  const lookback = Math.min(100, lastIndex)
  const start = lastIndex - lookback

  let highestHigh = -Infinity
  let lowestLow = Infinity

  for (let i = start; i <= lastIndex; i++) {
    if (candles[i].high > highestHigh) highestHigh = candles[i].high
    if (candles[i].low < lowestLow) lowestLow = candles[i].low
  }

  const range = highestHigh - lowestLow
  if (range <= 0) return { nearestLevel: null, levelName: '', levelType: 'support' }

  const fibLevels = [
    { ratio: 0.236, name: '23.6%' },
    { ratio: 0.382, name: '38.2%' },
    { ratio: 0.5, name: '50%' },
    { ratio: 0.618, name: '61.8%' },
    { ratio: 0.786, name: '78.6%' },
  ]

  const entry = candles[lastIndex].close
  let nearestLevel: number | null = null
  let nearestDist = Infinity
  let levelName = ''
  let levelType: 'support' | 'resistance' = 'support'

  for (const fib of fibLevels) {
    const level = lowestLow + range * fib.ratio
    const dist = Math.abs(entry - level)
    if (dist < nearestDist) {
      nearestDist = dist
      nearestLevel = level
      levelName = fib.name
      levelType = entry > level ? 'support' : 'resistance'
    }
  }

  return { nearestLevel, levelName, levelType }
}

function analyzePriceAction(
  candles: Candle[],
  lastIndex: number
): {
  bullishEngulfing: boolean
  bearishEngulfing: boolean
  hammer: boolean
  shootingStar: boolean
  doji: boolean
  bullishHarami: boolean
  bearishHarami: boolean
  morningStar: boolean
  eveningStar: boolean
} {
  if (lastIndex < 2) {
    return {
      bullishEngulfing: false, bearishEngulfing: false,
      hammer: false, shootingStar: false, doji: false,
      bullishHarami: false, bearishHarami: false,
      morningStar: false, eveningStar: false,
    }
  }

  const curr = candles[lastIndex]
  const prev = candles[lastIndex - 1]
  const prevPrev = candles[lastIndex - 2]

  const currBody = Math.abs(curr.close - curr.open)
  const prevBody = Math.abs(prev.close - prev.open)
  const prevPrevBody = Math.abs(prevPrev.close - prevPrev.open)
  const currRange = curr.high - curr.low
  const avgBody = (currBody + prevBody + prevPrevBody) / 3

  const bullishEngulfing =
    prev.close < prev.open &&
    curr.close > curr.open &&
    curr.open <= prev.close &&
    curr.close >= prev.open &&
    currBody > prevBody

  const bearishEngulfing =
    prev.close > prev.open &&
    curr.close < curr.open &&
    curr.open >= prev.close &&
    curr.close <= prev.open &&
    currBody > prevBody

  const lowerWick = Math.min(curr.open, curr.close) - curr.low
  const upperWick = curr.high - Math.max(curr.open, curr.close)

  const hammer =
    currBody > 0 &&
    currRange > 0 &&
    lowerWick > currBody * 2 &&
    upperWick < currBody * 0.5 &&
    curr.close > curr.open

  const shootingStar =
    currBody > 0 &&
    currRange > 0 &&
    upperWick > currBody * 2 &&
    lowerWick < currBody * 0.5 &&
    curr.close < curr.open

  const doji =
    currBody > 0 &&
    currRange > 0 &&
    currBody < currRange * 0.1

  const bullishHarami =
    prev.close < prev.open &&
    curr.close > curr.open &&
    curr.open > prev.close &&
    curr.close < prev.open &&
    currBody < prevBody * 0.6

  const bearishHarami =
    prev.close > prev.open &&
    curr.close < curr.open &&
    curr.open < prev.close &&
    curr.close > prev.open &&
    currBody < prevBody * 0.6

  const morningStar =
    prevPrev.close < prevPrev.open &&
    prevBody > avgBody * 0.5 &&
    currBody > avgBody * 0.5 &&
    prev.close < prevPrev.close &&
    curr.close > (prevPrev.open + prevPrev.close) / 2 &&
    curr.close > curr.open

  const eveningStar =
    prevPrev.close > prevPrev.open &&
    prevBody > avgBody * 0.5 &&
    currBody > avgBody * 0.5 &&
    prev.close > prevPrev.close &&
    curr.close < (prevPrev.open + prevPrev.close) / 2 &&
    curr.close < curr.open

  return {
    bullishEngulfing, bearishEngulfing,
    hammer, shootingStar, doji,
    bullishHarami, bearishHarami,
    morningStar, eveningStar,
  }
}

function analyzeSession(): { session: string; multiplier: number } {
  const hour = new Date().getUTCHours()

  if (hour >= 0 && hour < 8) {
    return { session: 'Asian', multiplier: 0.8 }
  } else if (hour >= 8 && hour < 13) {
    return { session: 'London', multiplier: 1.0 }
  } else if (hour >= 13 && hour < 16) {
    return { session: 'London-NY Overlap', multiplier: 1.1 }
  } else if (hour >= 16 && hour < 21) {
    return { session: 'New York', multiplier: 1.0 }
  } else {
    return { session: 'Late NY', multiplier: 0.85 }
  }
}

function calculateDynamicRiskReward(
  atr: number,
  entry: number,
  trendStrength: { strong: boolean; bullish: boolean; gapPercent: number },
  signal: Signal,
  confidence: number,
  risk: number
): { min: number; preferred: number; max: number; atrMultiplier: number } {
  const volatilityRatio = entry > 0 ? atr / entry : 0
  const volatilityFactor = Math.min(volatilityRatio * 100, 2.0)

  let adjustedRR = BASE_RISK_REWARD

  if (volatilityFactor > 1.0) {
    adjustedRR -= VOLATILITY_RR_ADJUSTMENT
  } else if (volatilityFactor < 0.3) {
    adjustedRR += VOLATILITY_RR_ADJUSTMENT
  }

  if (trendStrength.strong) {
    adjustedRR += TREND_RR_BONUS
  }

  const confidenceFactor = confidence / 100
  adjustedRR += (confidenceFactor - 0.5) * CONFIDENCE_RR_SCALING

  return {
    min: Math.max(1.0, adjustedRR - 0.5),
    preferred: Math.max(1.2, adjustedRR),
    max: Math.min(4.0, adjustedRR + 1.0),
    atrMultiplier: Math.max(2.0, adjustedRR * 1.2),
  }
}

function calculateConfidence(
  buyScore: number,
  sellScore: number,
  signal: Signal,
  trendStrength: { strong: boolean; bullish: boolean; gapPercent: number },
  structure: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  rsi: number,
  histogram: number,
  adx: number,
  sessionMultiplier: number
): number {
  const total = buyScore + sellScore
  if (total <= 0) return 30

  const strongest = Math.max(buyScore, sellScore)
  const dominance = strongest / total

  let confidence = 45 + dominance * 35

  if (total < 15) confidence -= 5
  else if (total > 30) confidence += 3

  if (trendStrength.strong) confidence += 3
  if (signal === 'BUY' && structure === 'BULLISH') confidence += 4
  if (signal === 'SELL' && structure === 'BEARISH') confidence += 4
  if (signal === 'BUY' && histogram > 0) confidence += 2
  if (signal === 'SELL' && histogram < 0) confidence += 2
  if (rsi > 45 && rsi < 55) confidence -= 2

  if (adx >= 30) confidence += 3
  else if (adx >= 25) confidence += 1
  else if (adx < 15) confidence -= 3

  confidence *= sessionMultiplier

  if (signal === 'HOLD') confidence = Math.min(confidence, 50)

  return Math.min(Math.max(confidence, 25), MAX_CONFIDENCE)
}

function analyzeMomentum(
  rsiValues: (number | null)[],
  macdValues: { macd: number | null; histogram: number | null }[],
  ema20Values: (number | null)[],
  lastIndex: number
): { rsiRising: boolean; rsiFalling: boolean; histogramGrowing: boolean } {
  const lookback = Math.min(MOMENTUM_LOOKBACK, lastIndex)
  const currentRsi = rsiValues[lastIndex]
  const previousRsi = rsiValues[lastIndex - lookback]
  const rsiDifference = currentRsi !== null && previousRsi !== null ? currentRsi - previousRsi : 0
  const currentHistogram = macdValues[lastIndex]?.histogram
  const previousHistogram = macdValues[lastIndex - lookback]?.histogram
  const histogramGrowing =
    currentHistogram !== null &&
    previousHistogram !== null &&
    Math.abs(currentHistogram) > Math.abs(previousHistogram) * 1.1

  return {
    rsiRising: rsiDifference > 2,
    rsiFalling: rsiDifference < -2,
    histogramGrowing,
  }
}

function calculateSlope(values: (number | null)[], index: number, lookback: number): number {
  const current = values[index]
  const previous = values[Math.max(0, index - lookback)]
  if (current === null || previous === null) return 0
  return current - previous
}

function analyzeTrendStrength(
  ema20: number,
  ema50: number,
  entry: number,
  atr: number
): { strong: boolean; bullish: boolean; gapPercent: number } {
  const gap = Math.abs(ema20 - ema50)
  const gapPercent = entry > 0 ? (gap / entry) * 100 : 0
  const atrMultiple = atr > 0 ? gap / atr : 0
  return { strong: atrMultiple >= 0.5, bullish: ema20 > ema50, gapPercent }
}

function analyzeMarketStructure(
  candles: Candle[],
  lastIndex: number
): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const start = Math.max(2, lastIndex - 30)
  const highs: number[] = []
  const lows: number[] = []

  for (let i = start; i < lastIndex - 2; i++) {
    const isHigh =
      candles[i].high > candles[i - 1].high &&
      candles[i].high > candles[i - 2].high &&
      candles[i].high > candles[i + 1].high &&
      candles[i].high > candles[i + 2].high
    const isLow =
      candles[i].low < candles[i - 1].low &&
      candles[i].low < candles[i - 2].low &&
      candles[i].low < candles[i + 1].low &&
      candles[i].low < candles[i + 2].low

    if (isHigh) highs.push(candles[i].high)
    if (isLow) lows.push(candles[i].low)
  }

  if (highs.length < 2 || lows.length < 2) return 'NEUTRAL'

  const previousHigh = highs[highs.length - 2]
  const latestHigh = highs[highs.length - 1]
  const previousLow = lows[lows.length - 2]
  const latestLow = lows[lows.length - 1]

  if (latestHigh > previousHigh && latestLow > previousLow) return 'BULLISH'
  if (latestHigh < previousHigh && latestLow < previousLow) return 'BEARISH'
  return 'NEUTRAL'
}

function detectDivergence(
  candles: Candle[],
  rsiValues: (number | null)[],
  lastIndex: number
): 'BULLISH' | 'BEARISH' | 'NONE' {
  const lookback = Math.min(30, lastIndex)
  const prices: number[] = []
  const rsi: number[] = []

  for (let i = lastIndex - lookback; i <= lastIndex; i++) {
    const rsiValue = rsiValues[i]
    if (rsiValue !== null && Number.isFinite(rsiValue)) {
      prices.push(candles[i].close)
      rsi.push(rsiValue)
    }
  }

  if (prices.length < 10) return 'NONE'

  const priceLows = findSwingPoints(prices, 'LOW')
  const rsiLows = findSwingPoints(rsi, 'LOW')

  if (priceLows.length >= 2 && rsiLows.length >= 2) {
    const previousPrice = priceLows[priceLows.length - 2]
    const latestPrice = priceLows[priceLows.length - 1]
    const previousRsi = rsiLows[rsiLows.length - 2]
    const latestRsi = rsiLows[rsiLows.length - 1]

    if (latestPrice < previousPrice && latestRsi > previousRsi) return 'BULLISH'
  }

  const priceHighs = findSwingPoints(prices, 'HIGH')
  const rsiHighs = findSwingPoints(rsi, 'HIGH')

  if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
    const previousPrice = priceHighs[priceHighs.length - 2]
    const latestPrice = priceHighs[priceHighs.length - 1]
    const previousRsi = rsiHighs[rsiHighs.length - 2]
    const latestRsi = rsiHighs[rsiHighs.length - 1]

    if (latestPrice > previousPrice && latestRsi < previousRsi) return 'BEARISH'
  }

  return 'NONE'
}

function detectMACDDivergence(
  candles: Candle[],
  macdValues: { macd: number | null; histogram: number | null }[],
  lastIndex: number
): 'BULLISH' | 'BEARISH' | 'NONE' {
  const lookback = Math.min(30, lastIndex)
  const prices: number[] = []
  const macdLine: number[] = []

  for (let i = lastIndex - lookback; i <= lastIndex; i++) {
    const macdVal = macdValues[i]?.macd
    if (macdVal !== null && macdVal !== undefined && Number.isFinite(macdVal)) {
      prices.push(candles[i].close)
      macdLine.push(macdVal)
    }
  }

  if (prices.length < 10) return 'NONE'

  const priceLows = findSwingPoints(prices, 'LOW')
  const macdLows = findSwingPoints(macdLine, 'LOW')

  if (priceLows.length >= 2 && macdLows.length >= 2) {
    const previousPrice = priceLows[priceLows.length - 2]
    const latestPrice = priceLows[priceLows.length - 1]
    const previousMacd = macdLows[macdLows.length - 2]
    const latestMacd = macdLows[macdLows.length - 1]

    if (latestPrice < previousPrice && latestMacd > previousMacd) return 'BULLISH'
  }

  const priceHighs = findSwingPoints(prices, 'HIGH')
  const macdHighs = findSwingPoints(macdLine, 'HIGH')

  if (priceHighs.length >= 2 && macdHighs.length >= 2) {
    const previousPrice = priceHighs[priceHighs.length - 2]
    const latestPrice = priceHighs[priceHighs.length - 1]
    const previousMacd = macdHighs[macdHighs.length - 2]
    const latestMacd = macdHighs[macdHighs.length - 1]

    if (latestPrice > previousPrice && latestMacd < previousMacd) return 'BEARISH'
  }

  return 'NONE'
}

function findSwingPoints(data: number[], type: 'HIGH' | 'LOW'): number[] {
  const points: number[] = []
  for (let i = 2; i < data.length - 2; i++) {
    const value = data[i]
    if (type === 'LOW') {
      if (value < data[i - 1] && value < data[i - 2] && value < data[i + 1] && value < data[i + 2]) {
        points.push(value)
      }
    } else {
      if (value > data[i - 1] && value > data[i - 2] && value > data[i + 1] && value > data[i + 2]) {
        points.push(value)
      }
    }
  }
  return points
}

function findResistanceLevels(candles: Candle[], entry: number, currentIndex: number): number[] {
  const start = Math.max(2, currentIndex - SWING_LOOKBACK)
  const levels: number[] = []

  for (let i = start; i < currentIndex - 2; i++) {
    const high = candles[i].high
    const isSwingHigh =
      high > candles[i - 1].high &&
      high > candles[i - 2].high &&
      high > candles[i + 1].high &&
      high > candles[i + 2].high

    if (isSwingHigh && high > entry) {
      levels.push(high)
    }
  }

  return removeNearbyLevels(levels)
}

function findSupportLevels(candles: Candle[], entry: number, currentIndex: number): number[] {
  const start = Math.max(2, currentIndex - SWING_LOOKBACK)
  const levels: number[] = []

  for (let i = start; i < currentIndex - 2; i++) {
    const low = candles[i].low
    const isSwingLow =
      low < candles[i - 1].low &&
      low < candles[i - 2].low &&
      low < candles[i + 1].low &&
      low < candles[i + 2].low

    if (isSwingLow && low < entry) {
      levels.push(low)
    }
  }

  return removeNearbyLevels(levels)
}

function removeNearbyLevels(levels: number[]): number[] {
  if (levels.length === 0) return []
  const sorted = [...levels].sort((a, b) => a - b)
  const filtered: number[] = []
  for (const level of sorted) {
    const previous = filtered[filtered.length - 1]
    if (previous === undefined || Math.abs(level - previous) > Math.abs(level) * 0.0005) {
      filtered.push(level)
    }
  }
  return filtered
}

function selectHoldReasons(buyReasons: string[], sellReasons: string[]): string[] {
  const reasons: string[] = []
  const topBuy = buyReasons.slice(0, 3)
  const topSell = sellReasons.slice(0, 3)
  if (topBuy.length > 0) reasons.push(`Bullish: ${topBuy.join('; ')}`)
  if (topSell.length > 0) reasons.push(`Bearish: ${topSell.join('; ')}`)
  return reasons
}

function createResult(
  signal: Signal,
  entry: number,
  stopLoss: number | null,
  takeProfit: number | null,
  riskReward: number | null,
  indicators: {
    ema20: number | null
    ema50: number | null
    rsi: number | null
    macd: { macd: number | null; signal: number | null; histogram: number | null }
    atr: number | null
    adx: number | null
    plusDI: number | null
    minusDI: number | null
    stochK: number | null
    stochD: number | null
    bbUpper: number | null
    bbLower: number | null
    bbWidth: number | null
    ichimokuCloud: boolean | null
  },
  confidence: number,
  reasons: string[]
): SignalResult {
  return {
    signal,
    entry,
    stopLoss,
    takeProfit,
    riskReward,
    ...indicators,
    confidence,
    reasons,
    output: createOutput(signal, entry, stopLoss, takeProfit, riskReward, confidence, reasons),
  }
}

function createOutput(
  signal: Signal,
  entry: number,
  stopLoss: number | null,
  takeProfit: number | null,
  riskReward: number | null,
  confidence: number,
  reasons: string[]
): string {
  const lines = [
    signal,
    `Entry: ${formatPrice(entry)}`,
    `SL: ${stopLoss !== null ? formatPrice(stopLoss) : 'N/A'}`,
    `TP: ${takeProfit !== null ? formatPrice(takeProfit) : 'N/A'}`,
    `R:R: ${riskReward !== null ? riskReward.toFixed(2) : 'N/A'}`,
    `Confidence: ${confidence}%`,
  ]
  if (reasons.length > 0) {
    lines.push('Reasons:', ...reasons.map(r => `• ${r}`))
  }
  return lines.join('\n')
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return 'N/A'
  if (Math.abs(value) >= 1000) return value.toFixed(2)
  if (Math.abs(value) >= 100) return value.toFixed(3)
  if (Math.abs(value) >= 1) return value.toFixed(5)
  return value.toFixed(6)
}
