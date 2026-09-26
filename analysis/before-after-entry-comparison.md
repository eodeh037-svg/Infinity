# Before vs After — entry-scoring change (controlled comparison)

## 1. Objective
Isolate the single change made in tradeSetup selection — the `entryScore` formula — and measure its effect on trade selection and outcomes under identical data, evaluation windows, costs and measurement. This is an analysis artifact; no production logic was modified.

## 2. Scope & constraints
- Same cached dataset for both modes (`/tmp/sigdata/candles.json`).
- Same methodology in both modes: wall-clock horizons, costs, gross/net R, MFE/MAE, reach flags (section 6).
- No AI/ML, no new dependencies, no production edits. Only `analysis/beforeAfterEntry.ts` is new (clearly marked temporary).
- The only behavioural difference between modes is the entry-score formula (section 4).

## 3. The change
BEFORE (verbatim recovered): market = 30+10; pullback = 30+20 − min(20, |ref−entry|/ATR·10). No rounding, no market chase penalty, no closeness/structural bonus.
AFTER (current exported `scoreEntryCandidate`): market = 40 − min(15, abs(round(max(0, meanDistanceATR−1)·10))); pullback = 50 − min(20, round(extensionATR·10)) + round((1−extensionATR/PULLBACK_MAX_ATR)·5) + 5 if structural anchor.

## 4. Logical isolation
Candidate generation, rejected-candidate bookkeeping, stop-loss, take-profit and R:R construction are byte-identical in both modes. Only `entryScore` differs (routed through `entryScoreFor(mode, …)`). Since candidate prices are identical in both modes, every observed delta is attributable solely to the scoring (selection) change.

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
- AFTER transcription asserted === production on every evaluated BUY/SELL window: entry, SL, TP, R:R, type, coherence, structural quality, rejected count. Any mismatch → exit(1).

## 7. Before vs After table
| metric | before | after | Δ | rel% |
|---|---:|---:|---:|---:|
| actionable trades | 281.0000 | 281.0000 | 0.0000 | 0.0% |
| hold rate % | 58.1845 | 58.1845 | 0.0000 | 0.0% |
| BUY count | 212.0000 | 212.0000 | 0.0000 | 0.0% |
| SELL count | 69.0000 | 69.0000 | 0.0000 | 0.0% |
| market entries | 175.0000 | 173.0000 | -2.0000 | -1.1% |
| pullback entries | 106.0000 | 108.0000 | 2.0000 | 1.9% |
| avg confidence | 73.3132 | 73.3132 | 0.0000 | 0.0% |
| median confidence | 78.0000 | 78.0000 | 0.0000 | 0.0% |
| avg entryScore | 41.4689 | 39.9858 | -1.4831 | -3.6% |
| avg |entry-ema20|/ATR | 0.9073 | 0.9127 | 0.0054 | 0.6% |
| avg extension/ATR | 0.2303 | 0.2353 | 0.0049 | 2.1% |
| avg chase/ATR | 0.9460 | 0.9460 | 0.0000 | 0.0% |
| gross expectancy R | 0.2201 | 0.2217 | 0.0015 | 0.7% |
| net expectancy R | 0.1663 | 0.1681 | 0.0019 | 1.1% |
| avg net R | 0.1663 | 0.1681 | 0.0019 | 1.1% |
| median net R | -0.1652 | -0.1652 | 0.0000 | 0.0% |
| win rate % | 27.6730 | 27.6730 | 0.0000 | 0.0% |
| loss rate % | 40.9253 | 40.9253 | 0.0000 | 0.0% |
| timeout rate % | 43.4164 | 43.4164 | 0.0000 | 0.0% |
| profit factor | 0.9707 | 0.9707 | 0.0000 | 0.0% |
| avg MFE R | 1.2943 | 1.2961 | 0.0018 | 0.1% |
| median MFE R | 0.9281 | 0.9281 | 0.0000 | 0.0% |
| avg MAE R | 0.8242 | 0.8202 | -0.0040 | -0.5% |
| median MAE R | 0.7604 | 0.7380 | -0.0224 | -2.9% |
| reached 1R % | 78.6477 | 79.0036 | 0.3559 | 0.5% |
| reached 1.5R % | 68.6833 | 69.0391 | 0.3559 | 0.5% |
| reached 2R % | 60.4982 | 60.4982 | 0.0000 | 0.0% |
| reached TP % | 16.0142 | 16.0142 | 0.0000 | 0.0% |
| avg costR | 0.0538 | 0.0535 | -0.0003 | -0.6% |
| median costR | 0.0271 | 0.0271 | 0.0000 | 0.0% |
| avg R:R | 2.5836 | 2.5859 | 0.0023 | 0.1% |

## 8. Signal / entry / performance / excursions / costs
Signal & entry (section 7): actionable trades, hold rate, BUY/SELL, market/pullback mix, avg & median confidence, avg entryScore, avg |entry−ema20|/ATR, avg extension/ATR, avg market chase/ATR, rejected candidates.
Performance (section 7): gross expectancy, net expectancy, avg & median net R, win/loss/timeout rate, profit factor, avg R:R.
Excursions (section 7): avg & median MFE/MAE (in R), reach 1R / 1.5R / 2R / TP %.
Costs (section 7): avg & median costR (round-trip friction as a fraction of risk).

## 9. Breakdowns
### By entry type
| entry type | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |
|---|---:|---:|---:|---:|---:|---:|
| market | 175 | 0.0343 | 173 | 0.0616 | -2 | 0.0273 |
| pullback | 106 | 0.3842 | 108 | 0.3388 | 2 | -0.0454 |

### By strategy
| strategy | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |
|---|---:|---:|---:|---:|---:|---:|
| scalping | 79 | -0.0071 | 79 | -0.0019 | 0 | 0.0052 |
| dayTrading | 38 | 0.2673 | 38 | 0.2673 | 0 | 0.0000 |
| swingTrading | 24 | 0.2868 | 24 | 0.2868 | 0 | 0.0000 |
| positionTrading | 23 | 0.3453 | 23 | 0.3453 | 0 | 0.0000 |
| general | 117 | 0.1906 | 117 | 0.1916 | 0 | 0.0010 |

### By direction
| direction | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |
|---|---:|---:|---:|---:|---:|---:|
| BUY | 212 | 0.2294 | 212 | 0.2318 | 0 | 0.0025 |
| SELL | 69 | -0.0275 | 69 | -0.0275 | 0 | 0.0000 |

Example changed windows (full details incl. SL/TP in JSON): EUR/USD|scalping|288, EUR/USD|scalping|365, EUR/USD|general|400, GBP/USD|dayTrading|463, GBP/USD|general|526

## 10. Bootstrap / uncertainty
- Paired windows where both modes selected a trade: 281; windows where only one mode had a trade: 0.
- Windows where the two modes selected a DIFFERENT setup (entry/SL/TP/type): 6 / 281 (2.1%).
- Mean paired ΔnetR = 0.0019 — 90% bootstrap CI [0.0003, 0.0042] (seeded, 2000 draws).
- Mean paired ΔgrossR = 0.0015 — 90% bootstrap CI [0.0000, 0.0038].
- Because ~98% of paired deltas are exactly 0 (identical selections), the CI reflects only a handful of changed windows; it should NOT be read as a robust positive edge.

## 11. Caveats & sample size
- Overlapping multi-strategy meta-sample: the same window can appear under more than one strategy, so trades are not independent draws.
- Bootstrap CIs are a sanity check, not a significance test; do not decide on a single E[R].
- Rows with small n are flagged LOW SAMPLE in section 9 (e.g. SELL, positionTrading, and any n < 30).
- entryScore scales differ between modes (BEFORE max ≈ 50; AFTER caps around 45 via rounding) — do not compare the two columns directly.
- Deltas that only move mirrored metrics (reached1R/1.5R moving together) are dominated by the same 6 changed windows.

## 12. Conclusion
APPROXIMATELY UNCHANGED — weakly positive, practically negligible.
The entry-scoring change altered the selected setup in only 6 of 281 actionable windows (2.1%); the remaining 275 traded identically under both formulas. Aggregate net expectancy moved from +0.166R to +0.168R (Δ +0.002R). The paired 90% bootstrap CI of ΔnetR (+0.0003 .. +0.0042) excludes 0 but the whole effect is driven by those six windows and is not practically meaningful. On this dataset the change is effectively inert: it does not improve or degrade measurable performance.

## 13. Reproduce
```
npx tsx analysis/beforeAfterEntry.ts
npx vitest run
npx tsc --noEmit
```
