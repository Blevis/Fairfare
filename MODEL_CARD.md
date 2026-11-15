# MODEL_CARD.md · Fairfare

> **Owner:** Blevis, Geri, Leandra · Numbers from NB03 / NB04 and `results/*.json` (July scored once on 2026-11-15).

## Intended use
Show a price before a standard metered NYC yellow-taxi trip starts. **Not for:** flex-fare / flat-fare / negotiated trips, trips outside NYC zones, anything where total cost (tolls, tips, fees) is needed.

## Model
- **Final features:** `f7_time_x`: distance, log distance, distance band; hour, weekday; pickup/drop-off borough, same borough, same zone; airport flags; pickup zone, drop-off zone and zone pair (**target-encoded inside the pipeline**, 5-fold cross-fitted on May); hour × weekend; distance × time-of-week band (10 columns).
- **Final model:** scikit-learn `HistGradientBoostingRegressor`, `loss="absolute_error"`, learning rate 0.1, 300 trees of ≤ 127 leaves, ≥ 100 trips per leaf, seed 0. **Trained on May 2026 only** (133 342 trips). Hyperparameters chosen on June: the cheapest setting within \$0.01 of the best June MAE on a flat grid.
- **Inputs at prediction time:** pickup time, pickup and drop-off zone IDs (+ their boroughs from the TLC lookup), planned distance. The pipeline selects only these columns (`BOOKING_INPUTS`) before computing features.

## Data and population
NYC TLC yellow-taxi records, a 600 000-trip sample from May–July 2026, split by pickup month (May train / June validation / July test). Population: standard Rate #01 trips paid by card or cash, known zones, positive fare and distance, duration of 1–180 min, under May's 99.9% caps (24.85 mi, \$96.80). Kept: May 133 342 (66.7%), June 133 459, July 128 359. Each removal step, with evidence, is in `PROBLEM.md`; the biggest is flex fares (23% of May), which are app-priced.

## Performance (July, scored once)
95% intervals: day-block bootstrap, 2 000 resamples of whole days.

| | MAE | RMSE | bias (actual − predicted) |
|---|---|---|---|
| Median baseline (May) | \$7.716 | \$12.239 | +\$3.137 |
| Rate rule fitted on May (\$6.67 + \$3.99/mi) | \$2.828 | \$3.796 | −\$0.479 |
| **Final model** | **\$2.002** (1.925 – 2.086) | **\$2.959** (2.823 – 3.124) | −\$0.105 |
| Difference vs median | −\$5.714 (−5.851 – −5.574) | −\$9.280 (−9.509 – −9.048) | |
| Difference vs rate rule | **−\$0.826** (−0.876 – −0.770) | −\$0.837 (−0.897 – −0.769) | |

June (validation) MAE of the same model: \$2.082 (bias +\$0.421). June helped choose the model, so July is the honest estimate.

## The quote buffer
**Quote = prediction + buffer[distance band]**, with each buffer the 90th percentile of June residuals in its band: 0–1 mi \$2.79 · 1–2 mi \$3.58 · 2–5 mi \$4.62 · 5–10 mi \$5.36 · 10–20 mi \$6.99 · 20+ mi \$3.93 (fallback: June has only 167 such trips). The rule was chosen over a single additive buffer and a multiplicative one by odd/even-day cross-fitting on June, because it gave the most even coverage across slices.

**July coverage = 92.6%** (target 90%). Average cushion (quote − fare) = \$4.03. Average amount quoted above the fare (0 when under) = \$4.25. When the fare exceeds the quote, it does so by \$2.94 on average.

## Where it fails (July, with n)
| Slice | n | MAE | bias | coverage |
|---|---|---|---|---|
| All trips | 128 359 | \$2.00 | −\$0.11 | 92.6% |
| Airport trips | 9 530 | \$2.81 | −\$0.52 | 94.8% |
| Long trips 10–20 mi | 4 795 | \$3.38 | −\$0.20 | 92.8% |
| **Very long trips 20+ mi** | **201** | \$4.33 | +\$0.93 | **72.1%** |
| Weekday rush hour (16–19) from Manhattan | 26 187 | \$2.11 | −\$0.01 | 90.4% |
| Midday 10–15 | 43 520 | \$2.35 | −\$0.35 | 91.3% |
| Night 0–5 | 8 599 | \$1.23 | +\$0.05 | 97.8% |
| Pickup in Queens | 9 096 | \$2.84 | −\$0.56 | 94.8% |
| Pickup in the Bronx | 53 | \$3.67 | −\$1.13 | 90.6% (n too small to judge) |
| *Actual speed < 6 mph (analysis only)* | 25 938 | \$2.94 | **+\$2.52** | **70.3%** |

Why: the meter charges \$0.70 per minute in slow traffic and **duration is unknown at booking**, so very slow trips are under-predicted and fast ones over-predicted. The 20+ mi band uses a fallback buffer that is too small. Other sources: flat airport fares (out of scope), and planned vs measured distance.

## Linear coefficients vs official fares
Starting charge **\$6.67** vs TLC **\$3.00**; per-mile **\$3.99** vs TLC **\$3.50** (distance-only OLS on May; TLC Rate #01 checked 2026-11-15 on https://www.nyc.gov/site/tlc/passengers/taxi-fare.page). Both are inflated by the per-minute charge for slow traffic, which grows with trip length. The official distance-only price under-predicts by \$4.89 per trip on average (June).

## Distribution shift observed
- July fares ran slightly **below** what the May-trained model expects: bias went from +\$0.42 (June) to −\$0.11 (July), and the fitted rate rule shows the same drift (−\$0.06 → −\$0.48). The June-calibrated buffer therefore over-covers in July (92.6% instead of 90%). Plausible causes, not tested here: lighter summer traffic, school holidays, events.
- Population drift: flex (app-priced) trips grow from 23% to 27% of all trips, and one vendor's `RatecodeID = 99` recording artefact varies from 0.02% to 3.4% by month. Neither changes the definition of a metered trip.

## Booking-time distance (added 2026-11-15, after the July run)
The website estimates the planned distance as straight-line distance between zone centroids × a detour factor fitted on May per straight-line length band (1.79 under 0.5 mi, ≈1.17–1.28 for 1–5 mi, ≈1.35–1.46 beyond). Evaluated on **June only** (NB05):
- distance error 0.53 mi on average (median 19%); long trips still under-estimated (+1.45 mi at 10–20 mi);
- frozen model fed estimated distances: MAE **\$3.26**, RMSE \$4.84 (vs \$2.08 / \$3.23 with odometer distance). The original buffers would cover 82%;
- separate per-band buffers for estimated distances (0–1 mi \$4.45 … 10–20 mi \$12.85) give 90.0% cross-fitted June coverage (average cushion \$5.27); airport trips stay below target (83%);
- experiments, not adopted: retraining on estimated distances (\$2.94) or using the May median distance of the zone pair (\$3.04).

## Limitations and what we would do next
- **Planned vs measured distance:** trained and evaluated on odometer distance. On June, ±5% / ±10% / ±20% distance error raises MAE to \$2.15 / \$2.30 / \$2.77 and lowers coverage to 89.9% / 89.3% / 87.0%. Next step: train on a routing engine's distance.
- **Population is defined with post-trip fields** (rate code, payment type, duration): a deployed quote assumes the trip is known to be metered.
- **Time in traffic is unobservable at booking;** a traffic-speed feed (by zone and hour) is the most promising added input.
- **Buffer by band only:** coverage varies by time of day (97.8% at night vs 91.3% midday). A band × time-of-day buffer, or quantile regression for the 90th percentile directly, would even it out. Give the 20+ mi band a buffer borrowed from 10–20 mi instead of the global fallback.
- **Evaluation history:** July was first scored on 2026-11-01 by the skeleton notebook (linear model, before any freeze; MAE \$2.512, coverage 92.4%). All final choices were made on June. The final score above comes from a single locked run after a disclosed lock reset.
- Three months of one year; seasonality and fare-rule changes beyond July 2026 are untested.
