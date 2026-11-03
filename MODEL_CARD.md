# MODEL_CARD.md · Fairfare

> **Owner:** Blevis, Geri, Leandra

## Intended use
Show a price before a standard metered NYC yellow-taxi trip starts. **Not for:** flex-fare / flat-fare / negotiated trips, trips outside NYC zones, anything where total cost (tolls, tips, fees) is needed.

## Model
Final features: ____ (feature set `FINAL_FEATURE_SET`). Final model: ____. Trained on May 2026 only. Hyperparameters chosen on June.

## Data and population
Source, month split, rows kept after each cleaning step (link to PROBLEM.md table), what is excluded and why.

## Performance (July, scored once)
| | MAE | RMSE |
|---|---|---|
| Median baseline | | |
| Final model | | |
| Difference (95% day-block bootstrap CI) | | |

## The quote buffer
Buffer = $____ (chosen on June for 90% coverage). July coverage = ___%. Average over-quote = $____.

## Where it fails (with n)
| Slice | n | MAE | bias | coverage |
|---|---|---|---|---|
| Airport trips | | | | |
| Long trips (10+ mi) | | | | |
| Rush hour, Manhattan | | | | |
| ... | | | | |

Why: the meter charges for slow-traffic time and **duration is unknown at booking**; flat airport fares; planned-vs-measured distance.

## Linear coefficients vs official fares
Starting charge ____ vs TLC ____; per-mile ____ vs TLC ____. (Verify current rates on the TLC page.)

## Limitations and what we would do next
