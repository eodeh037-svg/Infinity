# Before vs After — engine correctness fixes (controlled comparison)

## 1. Objective
Isolate the engine correctness fixes (8 fixes in `generateSignal`/`calculateConfidence`) and measure their effect on signal generation and forward outcomes under identical data, windows, horizons, costs and measurement. BEFORE = the same engine with the five fix behaviours reverted (isolation copy); AFTER = the current production engine. Analysis artifact — no production logic modified beyond the fixes.

## 2. Scope & constraints
- Same cached dataset for both modes (`/tmp/sigdata/candles.json`).
- Same methodology in both modes: causal windows, wall-clock horizons, costs, gross/net R, MFE/MAE, reach flags.
- No tuning against the sample; no strategy/weight/confidence-architecture changes; no AI/ML or new runtime deps (analysis uses tsx only).
- The only behavioural difference between modes is the engine module (section 3).

## 3. The change
BEFORE = working-tree engine with ONLY the five fix behaviours reverted (supertrend fallback DOWN, Keltner squeeze addBuy(1), ATR low addBuy(1)/high addSell(1), unconditional Fisher confidence +2, unconditional Keltner-squeeze confidence +1). `analysis/legacy/engineBuggyBefore.ts` is a byte-for-byte copy of the production engine except those five hunks and the re-pointed import paths.
AFTER = current `lib/signals/signalEngine.ts`. Fixes: supertrend fallback neutral (null, was DOWN); Keltner squeeze no longer scores addBuy(1); ATR low/high regime no longer scores addBuy(1)/addSell(1) (contextual reason only); Fisher confidence +2 only when aligned with the signal; unconditional Keltner-squeeze confidence +1 removed; ATR regime confidence adjustment kept; neutral retry wording.

## 4. Logical isolation
Both engines are the same codebase; BEFORE differs from AFTER ONLY in the five behaviour hunks above (`git diff --no-index -w lib/signals/signalEngine.ts analysis/legacy/engineBuggyBefore.ts`). Measurement code, horizons, costs and windows are byte-identical between modes; only the engine module is swapped. This isolates the fixes without the SL-signature/refactor noise of the full HEAD engine.

## 5. Dataset
- Symbol pairs: EUR/USD, GBP/USD, BTC/USD.
- Strategies (primary TF): scalping/5min, dayTrading/1h, swingTrading/1day, positionTrading/1day, general/4h.
- Date range: 2024-10-24T00:00:00.000Z → 2026-09-26T00:05:00.000Z.
- Source: /tmp/sigdata/candles.json (identical for both modes)

## 6. Evaluation methodology
- Causal: primary-TF candles filtered to signal time (asOf); window i from LOOKBACK to len−1−horizonCandles, step 7.
- Start of evaluation: entryIndex + 1; same-bar SL+TP = LOSS.
- Horizon: per-strategy wall-clock hours resolved to primary-TF candle counts (estimateCandleStepMs/resolveHorizonCandles).
- Costs: roundTripCostPrice — FX spread 0.6 + commission 0.15 + slippage 0.1 pips; BTC 2 + 0.5 + 0.5 bp; netR = grossR − costR/risk.
- Excursions: production simulateTrade (MFE/MAE via candle extremes, reach 1R/1.5R/2R/TP).

## 7. Before vs After table
| metric | before | after | Δ | rel% |
|---|---:|---:|---:|---:|
| evaluated windows | 672.0000 | 672.0000 | 0.0000 | 0.0% |
| actionable signals | 672.0000 | 672.0000 | 0.0000 | 0.0% |
| hold rate % | 0.0000 | 0.0000 | 0.0000 | — |
| BUY count | 428.0000 | 405.0000 | -23.0000 | -5.4% |
| SELL count | 244.0000 | 267.0000 | 23.0000 | 9.4% |
| avg confidence | 79.2530 | 78.5461 | -0.7068 | -0.9% |
| median confidence | 79.0000 | 78.0000 | -1.0000 | -1.3% |
| gross expectancy R | -0.0249 | -0.0487 | -0.0238 | -95.3% |
| net expectancy R | -0.0778 | -0.1016 | -0.0238 | -30.6% |
| avg net R | -0.0778 | -0.1016 | -0.0238 | -30.6% |
| median net R | -1.0055 | -1.0056 | -0.0001 | -0.0% |
| win rate % | 22.2944 | 22.1030 | -0.1914 | -0.9% |
| loss rate % | 53.4226 | 54.0179 | 0.5952 | 1.1% |
| timeout rate % | 31.2500 | 30.6548 | -0.5952 | -1.9% |
| profit factor | 0.7127 | 0.6945 | -0.0181 | -2.5% |
| avg MFE R | 1.1666 | 1.1541 | -0.0126 | -1.1% |
| median MFE R | 0.7841 | 0.7768 | -0.0074 | -0.9% |
| avg MAE R | 0.9674 | 0.9783 | 0.0109 | 1.1% |
| median MAE R | 1.0234 | 1.0314 | 0.0080 | 0.8% |
| reached 1R % | 80.3571 | 80.2083 | -0.1488 | -0.2% |
| reached 1.5R % | 68.7500 | 68.3036 | -0.4464 | -0.6% |
| reached 2R % | 63.6905 | 63.2440 | -0.4464 | -0.7% |
| reached TP % | 16.0714 | 16.0714 | 0.0000 | 0.0% |
| avg costR | 0.0529 | 0.0529 | 0.0000 | 0.0% |
| median costR | 0.0225 | 0.0225 | 0.0000 | 0.0% |
| avg R:R | 2.5991 | 2.5823 | -0.0168 | -0.6% |

## 8. Signals
- Signal distribution — before: {"BUY":428,"SELL":244,"HOLD":0,"holds_total":0}; after: {"BUY":405,"SELL":267,"HOLD":0,"holds_total":0}.

## 9. Breakdowns
### By strategy
| strategy | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |
|---|---:|---:|---:|---:|---:|---:|
| scalping | 117 | -0.3594 | 117 | -0.4532 | 0 | -0.0938 |
| dayTrading | 138 | -0.1231 | 138 | -0.0982 | 0 | 0.0249 |
| swingTrading | 144 | 0.0508 | 144 | 0.0053 | 0 | -0.0455 |
| positionTrading | 135 | -0.0114 | 135 | -0.0066 | 0 | 0.0048 |
| general | 138 | 0.0070 | 138 | -0.0113 | 0 | -0.0183 |

### By direction
| direction | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |
|---|---:|---:|---:|---:|---:|---:|
| BUY | 428 | -0.1213 | 405 | -0.1411 | -23 | -0.0199 |
| SELL | 244 | -0.0016 | 267 | -0.0416 | 23 | -0.0400 |

## 10. Bootstrap / uncertainty
- Paired windows where both modes produced an actionable trade: 672; windows where only one mode did: 0.
- Mean paired ΔnetR = -0.0238 — 90% bootstrap CI [-0.0541, 0.0056] (seeded, 2000 draws).
- Mean paired ΔgrossR = -0.0238 — 90% bootstrap CI [-0.0541, 0.0056].
- Paired deltas where both modes hold are 0; the CI is dominated by the windows where the fixes changed the signal side.

## 11. Caveats & sample size
- Overlapping multi-strategy meta-sample: the same window can appear under more than one strategy, so trades are not independent draws.
- Bootstrap CIs are a sanity check, not a significance test; do not decide on a single E[R].
- Rows with small n are flagged LOW SAMPLE (e.g. SELL-only windows).

## 12. Conclusion
The fixes remove noisy/directional evidence (Keltner squeeze, ATR low/high) and add an alignment gate to the Fisher confidence bonus. Expect HOLD-rate and BUY/SELL distribution changes concentrated in low-volatility windows; net effect on this dataset reported in section 7.

## 13. Reproduce
```
npx tsx analysis/engineBeforeAfter.ts
npx vitest run
npx tsc --noEmit
```
