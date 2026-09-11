import { View, Text, ScrollView, Dimensions, Pressable } from 'react-native'
import { useRef, useState } from 'react'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CHART_PADDING = 16
const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING * 2
const CANDLE_AREA_HEIGHT = 280
const VOLUME_HEIGHT = 50
const BOTTOM_AXIS_HEIGHT = 24

type CandleData = {
  time: number
  open: number
  high: number
  low: number
  close: number
}

type Props = {
  candles: CandleData[]
  entryPrice?: number | null
  stopLoss?: number | null
  takeProfit?: number | null
}

export default function CandleChart({ candles, entryPrice, stopLoss, takeProfit }: Props) {
  const scrollViewRef = useRef<ScrollView>(null)
  const [tooltip, setTooltip] = useState<CandleData | null>(null)

  const visibleCandles = candles.slice(-40)
  if (visibleCandles.length === 0) return null

  const highs = visibleCandles.map(c => c.high)
  const lows = visibleCandles.map(c => c.low)
  const maxPrice = Math.max(...highs)
  const minPrice = Math.min(...lows)
  const priceRange = maxPrice - minPrice || 0.001
  const padding = priceRange * 0.1
  const adjustedMax = maxPrice + padding
  const adjustedMin = minPrice - padding
  const adjustedRange = adjustedMax - adjustedMin

  const candleWidth = Math.max(Math.floor((CHART_WIDTH - 60) / visibleCandles.length) - 2, 3)
  const gap = 2
  const totalWidth = (candleWidth + gap) * visibleCandles.length

  const maxVolume = Math.max(...visibleCandles.map(c => Math.abs(c.close - c.open) * 10000 || 1))

  function priceToY(price: number): number {
    return ((adjustedMax - price) / adjustedRange) * CANDLE_AREA_HEIGHT
  }

  function formatDate(timestamp: number): string {
    const d = new Date(timestamp)
    const month = d.toLocaleString('default', { month: 'short' })
    const day = d.getDate()
    return `${month} ${day}`
  }

  function formatPrice(price: number): string {
    if (Math.abs(price) >= 1000) return price.toFixed(2)
    if (Math.abs(price) >= 100) return price.toFixed(3)
    return price.toFixed(5)
  }

  const horizontalLines = 5
  const horizontalLinesArray = Array.from({ length: horizontalLines }, (_, i) => {
    const price = adjustedMin + (adjustedRange / (horizontalLines - 1)) * i
    return { price, y: priceToY(price) }
  })

  const levelLines = [
    { price: entryPrice, color: '#3B82F6', label: 'Entry' },
    { price: stopLoss, color: '#EF4444', label: 'SL' },
    { price: takeProfit, color: '#22C55E', label: 'TP' },
  ].filter(l => l.price != null && l.price > 0)

  return (
    <View>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: Math.max(totalWidth, CHART_WIDTH) }}
      >
        <View style={{ width: Math.max(totalWidth, CHART_WIDTH), height: CANDLE_AREA_HEIGHT + BOTTOM_AXIS_HEIGHT + VOLUME_HEIGHT + 8 }}>
          {horizontalLinesArray.map((line, i) => (
            <View key={i} style={{ position: 'absolute', top: line.y, left: 0, right: 40, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#1C1C2E' }} />
              <Text style={{ color: '#64646E', fontSize: 9, marginLeft: 4, minWidth: 50, textAlign: 'right' }}>
                {formatPrice(line.price)}
              </Text>
            </View>
          ))}

          {levelLines.map((line, i) => {
            const y = priceToY(line.price!)
            return (
              <View key={`level-${i}`} style={{ position: 'absolute', top: y, left: 0, right: 40, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, height: 1, backgroundColor: line.color, borderStyle: 'dashed' }} />
                <View style={{ backgroundColor: line.color, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, marginLeft: 4 }}>
                  <Text style={{ color: '#FFF', fontSize: 8, fontWeight: '600' }}>
                    {line.label} {formatPrice(line.price!)}
                  </Text>
                </View>
              </View>
            )
          })}

          {visibleCandles.map((candle, i) => {
            const isGreen = candle.close >= candle.open
            const color = isGreen ? '#22C55E' : '#EF4444'
            const bodyTop = priceToY(Math.max(candle.open, candle.close))
            const bodyBottom = priceToY(Math.min(candle.open, candle.close))
            const bodyHeight = Math.max(bodyBottom - bodyTop, 1)
            const wickTop = priceToY(candle.high)
            const wickBottom = priceToY(candle.low)
            const x = i * (candleWidth + gap) + (candleWidth / 2)
            const volume = Math.abs(candle.close - candle.open) * 10000
            const volumeHeight = (volume / maxVolume) * VOLUME_HEIGHT

            return (
              <Pressable
                key={i}
                onPress={() => setTooltip(tooltip === candle ? null : candle)}
                style={{ position: 'absolute', left: i * (candleWidth + gap), top: 0, width: candleWidth + gap, height: CANDLE_AREA_HEIGHT + VOLUME_HEIGHT + BOTTOM_AXIS_HEIGHT }}
              >
                <View style={{ position: 'absolute', left: x - 0.5, top: wickTop, width: 1, height: wickBottom - wickTop, backgroundColor: color }} />
                <View style={{ position: 'absolute', left: 0, top: bodyTop, width: candleWidth, height: bodyHeight, backgroundColor: color, borderRadius: 1 }} />
                <View style={{ position: 'absolute', left: 0, top: CANDLE_AREA_HEIGHT + 8, width: candleWidth, height: volumeHeight, backgroundColor: `${color}30`, borderRadius: 1 }} />
              </Pressable>
            )
          })}

          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 40, flexDirection: 'row', justifyContent: 'space-between' }}>
            {visibleCandles.filter((_, i) => i % Math.max(Math.floor(visibleCandles.length / 5), 1) === 0).map((candle, i) => (
              <Text key={i} style={{ color: '#64646E', fontSize: 9 }}>
                {formatDate(candle.time)}
              </Text>
            ))}
          </View>

          {tooltip && (
            <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#1C1C2E', borderRadius: 8, padding: 8, zIndex: 10 }}>
              <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600', marginBottom: 4 }}>
                {formatDate(tooltip.time)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View>
                  <Text style={{ color: '#64646E', fontSize: 9 }}>O</Text>
                  <Text style={{ color: '#FFF', fontSize: 10 }}>{formatPrice(tooltip.open)}</Text>
                </View>
                <View>
                  <Text style={{ color: '#64646E', fontSize: 9 }}>H</Text>
                  <Text style={{ color: '#22C55E', fontSize: 10 }}>{formatPrice(tooltip.high)}</Text>
                </View>
                <View>
                  <Text style={{ color: '#64646E', fontSize: 9 }}>L</Text>
                  <Text style={{ color: '#EF4444', fontSize: 10 }}>{formatPrice(tooltip.low)}</Text>
                </View>
                <View>
                  <Text style={{ color: '#64646E', fontSize: 9 }}>C</Text>
                  <Text style={{ color: tooltip.close >= tooltip.open ? '#22C55E' : '#EF4444', fontSize: 10 }}>{formatPrice(tooltip.close)}</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
