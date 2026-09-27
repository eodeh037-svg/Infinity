## Technical Analysis Engine

Infinity uses a rule-based technical-analysis pipeline to transform normalized market candles into a directional signal and trade setup.

The signal system is **not an AI/ML model** and does not predict future prices. It evaluates technical, market-structure, volume, sentiment, volatility, and multi-timeframe evidence using deterministic rules and weighted scoring.

The live signal path consists of two major stages:

1. **Multi-timeframe directional analysis** — evaluates market conditions and determines the final `BUY`, `SELL`, or `HOLD` direction.
2. **Trade setup planning** — independently selects an entry, stop-loss, and take-profit using structural levels, ATR-based constraints, risk/reward requirements, and setup scoring.

The trade-setup planner is authoritative for the final actionable trade levels. The entry/SL/TP values calculated internally by the lower-level signal engine are not used by the live `buildTradeSetup` path.

---

### 1. Executive Summary

The current signal architecture is built around seven capped evidence families:

| Evidence family | Maximum contribution per side |
| --------------- | ----------------------------: |
| Trend           |                             8 |
| Momentum        |                             7 |
| Mean reversion  |                             8 |
| Volume          |                             4 |
| Sentiment       |                             5 |
| Volatility      |                             4 |
| Price action    |                             6 |

Individual technical rules contribute weighted evidence to these families. Family caps prevent a single category from dominating the directional result.

The resulting directional scores are compared to determine:

* `BUY`
* `SELL`
* `HOLD`

Directional confidence is calculated separately from the raw signal score. Confidence starts from score dominance and is then adjusted using additional market-condition and indicator factors.

The multi-timeframe layer aggregates directional information across configured timeframes before the trade planner constructs the final setup.

The final actionable setup contains an action, entry, stop-loss, take-profit, confidence-related information, and supporting reasons/context.

---

### 2. Complete Analysis Components

Infinity's current signal implementation imports and evaluates the following analysis components:

| Component            | Primary role                   | Directional evidence |               Confidence | Entry / SL / TP |
| -------------------- | ------------------------------ | -------------------: | -----------------------: | --------------: |
| EMA 20               | Short-term trend               |                  Yes |                      Yes |         Context |
| EMA 50               | Medium-term trend              |                  Yes |                      Yes |         Context |
| RSI                  | Momentum / mean reversion      |                  Yes |                      Yes |         Context |
| MACD                 | Momentum / trend confirmation  |                  Yes |                      Yes |         Context |
| ATR                  | Volatility / risk distance     |                  Yes |                      Yes |             Yes |
| ADX                  | Trend strength                 |                  Yes |                      Yes |         Context |
| Bollinger Bands      | Mean reversion / volatility    |                  Yes |                  Context |         Context |
| Bollinger squeeze    | Compression detection          | No directional score |                 No bonus |         Context |
| Stochastic           | Momentum / overbought-oversold |                  Yes |                  Context |         Context |
| Ichimoku / Cloud     | Trend / structure              |                  Yes |                  Context |         Context |
| Williams %R          | Mean reversion / momentum      |                  Yes |                  Context |         Context |
| OBV                  | Volume confirmation            |                  Yes |                  Context |         Context |
| VWAP                 | Price/volume reference         |                  Yes |                  Context |         Context |
| Fear & Greed         | Sentiment                      |                  Yes |                      Yes |         Context |
| Supertrend           | Trend confirmation             |                  Yes |                      Yes |         Context |
| Funding Rate         | Sentiment proxy                |                  Yes |                  Context |         Context |
| MVRV                 | Sentiment proxy                |                  Yes |                  Context |         Context |
| Fisher Transform     | Momentum confirmation          |          Conditional |                      Yes |         Context |
| CMO                  | Momentum                       |                  Yes |                      Yes |         Context |
| Keltner Channels     | Volatility / trend context     |          Conditional |                      Yes |         Context |
| Parabolic SAR        | Trend confirmation             |                  Yes |                      Yes |         Context |
| Stochastic RSI       | Momentum                       |                  Yes |                      Yes |         Context |
| ATR Percentile       | Volatility context             |              Context | Computed but not applied |         Context |
| Market structure     | Structural context             |                  Yes |                      Yes |             Yes |
| Support / resistance | Key-level context              |              Context |                  Context |             Yes |
| Volatility regime    | Regime classification          |              Context |                  Context |      Risk/setup |

The distinction between these categories is important: **not every calculated indicator directly determines the final direction**, and not every indicator contributing to confidence contributes to the final trade levels.

---

### 3. Directional Signal Pipeline

The lower-level signal engine evaluates the available candle data and applies a collection of discrete rules.

Each rule can generate weighted bullish or bearish evidence. The evidence is assigned to one of seven families:

```text
Trend
Momentum
Mean Reversion
Volume
Sentiment
Volatility
Price Action
```

Each family has a maximum contribution per direction:

```text
Trend          → 8
Momentum       → 7
Mean Reversion → 8
Volume         → 4
Sentiment      → 5
Volatility     → 4
Price Action   → 6
```

This creates a bounded scoring system rather than allowing an unlimited number of correlated indicators to accumulate in one category.

The approximate implementation contains around 40 discrete directional rules distributed across these evidence families.

The engine maintains separate bullish and bearish totals:

```text
buyScore
sellScore
```

The final direction is determined from the relationship between those scores and the engine's HOLD conditions.

#### Directional interpretation

```text
Higher bullish evidence → BUY
Higher bearish evidence → SELL
Insufficient separation → HOLD
```

The system does not interpret a high score as a guarantee of a future price movement. It represents the amount of rule-based evidence available under the configured scoring model.

---

### 4. Confidence Pipeline

Signal direction and confidence are calculated separately.

The base directional confidence is derived from score dominance:

```text
Base confidence = 45 + dominance × 35
```

The result is then modified by additional factors.

The confidence layer considers conditions including:

* trend strength
* market-structure agreement
* MACD
* ADX
* crypto-volatility conditions
* sentiment
* Supertrend
* Fisher Transform
* CMO
* Parabolic SAR
* Stochastic RSI
* ATR regime

The resulting directional confidence is clamped to the engine's configured range:

```text
Minimum directional confidence: 35
Maximum directional confidence: 95
```

HOLD signals are restricted to a maximum confidence of:

```text
50
```

Confidence therefore represents the engine's internal level of agreement/strength under its scoring rules. It is **not a statistical probability of a trade being profitable**.

---

### 5. Multi-Timeframe Pipeline

The multi-timeframe layer is implemented separately from the lower-level signal engine.

The main live pipeline is:

```text
Market candles
     ↓
Timeframe analysis
     ↓
Per-timeframe directional result
     ↓
Timeframe aggregation
     ↓
Agreement / spread evaluation
     ↓
Final directional selection
     ↓
Trade setup planner
```

The multi-timeframe layer evaluates configured timeframes and combines their directional information using timeframe-specific weighting.

The resulting aggregate direction is then evaluated against agreement and HOLD conditions.

The MTF layer can therefore prevent a weakly aligned collection of timeframe signals from becoming an actionable direction.

#### MTF HOLD conditions

The MTF layer can produce a neutral result when the directional spread is insufficient:

```text
spread ≤ (1 - minAgreement)
AND
maximum directional weight < 0.5
```

There is also a neutral condition associated with strong trend alignment combined with a very small spread:

```text
trendAlignment > 0.6
AND
spread < 0.15
```

These conditions are separate from the lower-level engine's own HOLD logic.

---

### 6. Market Structure

Market structure is used as an additional source of directional and trade-setup context.

The context layer evaluates structural information such as:

* swing highs
* swing lows
* support
* resistance
* structural trend
* key price levels

Structure is used in multiple stages of the system.

At the directional-analysis level, structural conditions can contribute evidence.

At the confidence level, structure agreement can increase or decrease confidence.

At the trade-planning level, structural levels are used to construct stop-loss and take-profit candidates.

This separation is important because a structural level does not automatically become an entry or exit. It is passed into the trade planner, where it is evaluated against ATR distance, reward/risk requirements, clustering, and setup coherence.

---

### 7. Entry Engine

The final entry is generated by `buildTradeSetup` in `tradeSetup.ts`.

The planner does not simply reuse the entry calculated by the lower-level signal engine.

Instead, it evaluates trade-entry candidates using a dedicated entry-planning process.

The main candidate types are:

```text
Market entry
Pullback-to-anchor entry
```

The entry planner uses an entry score with a maximum of:

```text
60 points
```

Candidate selection considers the relationship between current price, directional context, structural anchors, and the available setup conditions.

The resulting entry is therefore a **planned trade level**, rather than simply the current market price or an indicator value.

The live setup planner replaces the lower-level engine's own entry/SL/TP output with the values generated by the planner.

---

### 8. Risk Management

ATR is central to the trade-level risk calculations.

The structural stop-loss is constrained using ATR-based distance rules.

The configured stop-distance range is:

```text
Minimum: 1.5 ATR
Maximum: 3.0 ATR
```

Under high-volatility conditions, the minimum stop distance becomes:

```text
2.0 ATR
```

This prevents the planner from selecting structural stops that are too close to the entry relative to current volatility.

The lower-level signal engine also contains a 2%-of-account risk-cap calculation and its own stop-loss selection logic.

However, those values are **not authoritative for the live trade setup** because `buildTradeSetup` constructs and substitutes its own final entry, stop-loss, and take-profit.

This distinction should be preserved when evaluating or extending the system.

---

### 9. Filters and Guardrails

The signal pipeline contains several layers of protection against weak or ambiguous setups.

#### Lower-level HOLD gate

The engine can return HOLD when:

```text
|buyScore - sellScore| ≤ 2
AND
maximum score < 6
```

This prevents small score differences from automatically becoming directional signals.

#### Multi-timeframe HOLD gate

The MTF layer applies its own agreement and spread checks before producing a final direction.

#### Final setup validation

The trade planner requires all three trade levels to be present before the setup can be considered actionable:

```text
entry != null
stopLoss != null
takeProfit != null
```

A directional signal without complete trade levels is therefore not treated as a fully actionable trade setup.

#### ATR distance constraints

Stop-loss selection is constrained by ATR-based minimum and maximum distances.

#### Dynamic reward/risk filtering

Take-profit candidates are evaluated against dynamic R:R requirements before being accepted.

#### Key-level filtering

Take-profit candidates are drawn from clustered structural/key levels where available.

#### ATR extension fallback

When suitable structural targets are unavailable, the planner can use an ATR-based extension fallback.

#### Neutral retry behavior

The engine's retry behavior uses neutral wording rather than implying a predetermined directional outcome.

---

### 10. Final Signal Object

The signal system exposes a structured result rather than returning only a string.

The core action type is:

```ts
type Signal = 'BUY' | 'SELL' | 'HOLD'
```

The signal engine is currently identified internally as:

```text
SIGNAL_ENGINE_VERSION = v2
```

The final signal data can contain information used by the application for:

* signal direction
* confidence
* entry
* stop-loss
* take-profit
* risk/reward information
* indicator-derived reasons
* market context
* timeframe information
* supporting analysis

The exact live trade levels are authoritative from the `buildTradeSetup` planner rather than the discarded lower-level entry/SL/TP calculations.

Conceptually, the live pipeline is:

```text
                    ┌──────────────────────┐
                    │   Normalized Candles  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Technical Indicators │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Directional Evidence │
                    │ 7 capped families    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ BUY / SELL / HOLD    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Confidence Pipeline  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Multi-Timeframe      │
                    │ Aggregation          │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Trade Setup Planner  │
                    ├──────────────────────┤
                    │ Entry                │
                    │ Stop Loss            │
                    │ Take Profit           │
                    │ Validation           │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Final Actionable     │
                    │ Signal / Setup       │
                    └──────────────────────┘
```

---

### 11. Complete Component Inventory

#### Trend

* EMA 20
* EMA 50
* ADX
* Supertrend
* Ichimoku Cloud
* Parabolic SAR
* Market-structure trend

#### Momentum

* RSI
* MACD
* Stochastic
* Williams %R
* Fisher Transform
* CMO
* Stochastic RSI

#### Mean Reversion

* RSI overbought/oversold conditions
* Bollinger Bands
* Stochastic conditions
* Williams %R
* CMO
* Price displacement/extension conditions
* Related mean-reversion scoring rules

#### Volume

* OBV
* VWAP
* Volume-related price confirmation

#### Sentiment

* Fear & Greed
* Funding Rate
* MVRV

#### Volatility

* ATR
* Bollinger squeeze
* Keltner Channels
* ATR regime
* ATR percentile

#### Price Action / Structure

* Swing highs
* Swing lows
* Support
* Resistance
* Structural levels
* Price-action conditions

#### Trade Construction

* Market-entry candidate
* Pullback-entry candidate
* Entry scoring
* Structural stop-loss
* ATR stop-distance constraints
* Key-level target clustering
* Dynamic R:R filtering
* ATR-extension target fallback
* Setup coherence scoring
* Final setup validation

---

### 12. Implementation Notes & Limitations

The current implementation contains several important technical limitations that should be understood when interpreting the engine.

#### Funding Rate and MVRV are candle-derived proxies

The current `fundingRate.ts` and `mvrv.ts` implementations derive their values from candle data.

They do not currently retrieve:

* exchange funding-rate data
* blockchain realized-capitalization data
* external on-chain MVRV datasets

Therefore, these components should be treated as **candle-derived proxies**, not as direct measurements of actual funding rates or blockchain MVRV.

#### Volatility-regime context is currently unavailable

The multi-timeframe implementation calls `detectVolatilityRegime` with an empty ATR array.

As a result, the volatility-regime context currently resolves to an unavailable state rather than a fully populated ATR-derived regime.

#### Keltner squeeze is non-directional

Keltner squeeze detection does not directly add bullish or bearish directional evidence.

It also does not currently provide a confidence bonus.

It should therefore be treated as volatility/compression context rather than a directional signal.

#### ATR regime is primarily contextual

ATR-regime logic contributes a small confidence adjustment, but the regime itself is not used as a direct bullish or bearish directional score.

The current confidence adjustment is:

```text
±1
```

depending on the configured ATR-regime condition.

#### Supertrend neutral handling

When Supertrend is neutral, the confidence pipeline uses the neutral fallback rather than treating neutrality as bullish or bearish confirmation.

#### Fisher confirmation requires alignment

The Fisher confidence adjustment is applied only when the relevant Fisher direction is aligned with the signal direction.

The verified adjustment is:

```text
+2
```

for qualifying aligned confirmation.

#### Stochastic RSI strong branches

The implementation contains strong Stochastic RSI branches whose conditions are mutually exclusive.

Those specific strong branches are therefore unreachable under the current condition structure.

They should not be interpreted as active scoring behavior unless the implementation is changed.

#### Computed values that are not currently applied

The audit identified several values that are calculated but do not currently affect the final result:

* `confidenceAdjustment`
* `sentimentMultiplier`
* `atrPercentile.multiplier`
* Fisher divergence

Their existence in the source should not be interpreted as evidence that they currently modify the final signal.

#### Lower-level entry/SL/TP calculations are superseded

The lower-level signal engine contains its own stop-loss and trade-level calculations, including a 2%-of-account risk-cap calculation.

However, the live `buildTradeSetup` path subsequently constructs its own trade setup and substitutes the planner's:

* entry
* stop-loss
* take-profit

Therefore, the lower-level values should not be described as the final live trade levels.

---

## Architecture Summary

The current Infinity signal architecture can be summarized as:

```text
Raw provider market data
        │
        ▼
Market-data normalization
        │
        ▼
Normalized candles
        │
        ▼
Technical indicator calculations
        │
        ▼
Rule-based directional scoring
        │
        ├── Trend
        ├── Momentum
        ├── Mean Reversion
        ├── Volume
        ├── Sentiment
        ├── Volatility
        └── Price Action
        │
        ▼
BUY / SELL / HOLD
        │
        ▼
Confidence calculation
        │
        ▼
Multi-timeframe aggregation
        │
        ▼
Directional selection
        │
        ▼
Trade setup planner
        │
        ├── Entry candidates
        ├── Structural levels
        ├── ATR constraints
        ├── Risk/reward filtering
        ├── TP candidates
        └── Setup coherence
        │
        ▼
Validation
        │
        ▼
Final signal setup
```

### Design Principles

The implementation follows several architectural principles:

* **Deterministic rules instead of AI/ML**
* **Separate direction from confidence**
* **Separate signal generation from trade construction**
* **Capped evidence families**
* **Multi-timeframe confirmation**
* **ATR-aware risk distances**
* **Structural entry and exit levels**
* **Explicit HOLD conditions**
* **Validation before a setup becomes actionable**

The engine is therefore best understood as a **deterministic, multi-indicator, multi-timeframe technical-analysis and trade-setup system** rather than a predictive AI model.

Its outputs represent the result of the configured rules and available market data at analysis time. They do not constitute a guarantee of future market movement or trading profitability.
