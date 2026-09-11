export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export type IndicatorPoint = {
  time: number
  value: number
}

export type MACDResult = {
  macd: number | null
  signal: number | null
  histogram: number | null
}

export type ADXResult = {
  adx: number | null
  plusDI: number | null
  minusDI: number | null
}

export type BollingerResult = {
  upper: number | null
  middle: number | null
  lower: number | null
  width: number | null
}

export type StochasticResult = {
  k: number | null
  d: number | null
}

export type IchimokuResult = {
  tenkan: number | null
  kijun: number | null
  senkouA: number | null
  senkouB: number | null
  chikou: number | null
}
