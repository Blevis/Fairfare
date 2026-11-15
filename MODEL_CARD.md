# MODEL_CARD.md · Fairfare

> **Owner:** Blevis, Geri, Leandra

## Intended use
Show a price before a standard metered NYC yellow-taxi trip starts. **Not for:** flex-fare / flat-fare / negotiated trips, trips outside NYC zones, anything where total cost (tolls, tips, fees) is needed.

## Model
Final features: FINAL_FEATURE_SET (feature set `FINAL_FEATURE_SET`). Final model: Linear Regression. Trained on May 2026 only. Hyperparameters chosen on June.

## Data and population
Source, month split, rows kept after each cleaning step (link to PROBLEM.md table), what is excluded and why.

## Performance (July, scored once)
| | MAE | RMSE |
|---|---|---|
| Median baseline |	7.716 |12.239 |
| Final model |	2.512 |3.390 |
| Difference (95% day-block bootstrap CI) |5.204  |8.849 |

## The quote buffer
Buffer = $4.16 (chosen on June for 90% coverage). July coverage = 92.4%. Average over-quote = $4.23.

## Where it fails (with n)
| Slice | n | MAE | bias | coverage |
|---|---|---|---|---|
| Airport trips |9530|3.548|-1.324|0.905|
| Long trips (10+ mi) |4996 |3.955|-1.046 |0.873|
| Rush hour, Manhattan |118684|2.424|-0.501|0.926|
| Slow trips |25938|3.238|2.870|0.729|

Why: the meter charges for slow-traffic time and **duration is unknown at booking**; flat airport fares; planned-vs-measured distance.

## Linear coefficients vs official fares
Starting charge 3.99 dollars vs TLC 3.00 dollars ; per-mile 6.67 dollars  vs TLC 3.50 dollars . (Verify current rates on the TLC page.)

## Limitations and what we would do next
The model performs worse for longer trips and slow-moving trips affected by traffic. Coverage falls to about 87% for trips over 10 miles and to 72.9% for trips with speeds below 6 mph. Distance alone cannot fully explain fare variation because traffic conditions and trip duration are not known at booking time. Future improvements would include traffic-related features, distance-dependent buffers, and airport-specific adjustments.