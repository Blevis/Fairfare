# PROBLEM.md · Fairfare (Task A: The Fare)

> **Owner:** P1 · **Reviewed by:** P2, P3 (attack it for leakage before any modelling) · **Status:** COMPLETE (numbers from NB02 / NB04)

## The question (one sentence)
Given the pickup time, pickup zone, drop-off zone and planned route length known **at booking**, predict the meter's `fare_amount` for a standard metered yellow-taxi trip in New York, so an app can quote a price before the trip starts that the final meter fare stays under on 90% of trips.

## Moment of prediction: booking
| Known at booking (allowed) | Not known (forbidden) |
|---|---|
| pickup time (hour, weekday) | drop-off time, duration |
| pickup & drop-off zone -> borough, airport flag, zone identity, zone pair | tip, total_amount |
| `trip_distance`, **treated as the planned route's length** | tolls, extra, mta_tax, improvement/congestion/airport/cbd fees |
| | `RatecodeID`, `payment_type` (set at trip end / payment) |
| | `passenger_count`, `request_source`, `VendorID` (excluded by decision) |

Enforcement: `FORBIDDEN` + `assert_no_leak` (names) and `BOOKING_INPUTS` (the pipeline is handed only pickup time, the two zone IDs, their boroughs and distance). `tests/test_protocol.py` scrambles every forbidden column and checks the predictions are unchanged.

- **`trip_distance` assumption:** in the data it is *measured during the trip*. We treat it as a stand-in for the routed distance a booking app would compute. A real route estimate has error, so our results are optimistic by that amount. **Quantified in NB04 §2b (June):** with ±5% / ±10% / ±20% (log-normal) distance error, June MAE goes from \$2.08 to \$2.15 / \$2.30 / \$2.77, and coverage of the 90% quote drops to 0.899 / 0.893 / 0.870.
- **`passenger_count`:** excluded. It is missing for exactly the flex trips (23.3% of May), is driver-entered, and the Rate #01 meter does not price by passengers.
- `RatecodeID` / `payment_type` are used **only to define the population**, never as features.

## Target and population decisions
From the `clean()` log on **May** (NB02 §2). Removals are sequential; % is of the 199 999 May trips.

| # | Decision | Rows removed | % of input | Why |
|---|---|---|---|---|
| 1 | Unknown/missing zones (264, 265) | 1 271 | 0.64 | no usable location |
| 2 | Flex fare trips (payment_type 0) | 46 429 | 23.22 | app-priced: under 1 mi the median is \$17.46/mi vs \$10.94/mi metered (75th pct \$42 vs \$14); from June on, `request_source` (app dispatch, ~91% HV0003) is filled only for these trips |
| 3 | Payment not card/cash (no charge, dispute, unknown, voided) | 1 650 | 0.83 | not real fares; carry most negative fares |
| 4 | Non-standard rate codes (JFK flat, Newark, Nassau/Westchester, negotiated, group, 99 = unknown) | 13 493 | 6.75 | different pricing regime. JFK ↔ Manhattan (\$70 flat, Rate #02) is out of scope; JFK ↔ elsewhere is metered and kept |
| 5 | `fare_amount <= 0` | 195 | 0.10 | population definition (applies identically to all months) |
| 6 | `trip_distance <= 0` | 725 | 0.36 | no route |
| 7 | Impossible duration (<1 min or >180 min) | 2 729 | 1.37 | validity check only; duration is never a feature |
| 8 | Above May 99.9% caps (24.85 mi, \$96.80) | 165 | 0.08 | caps fitted on May only |

Kept: **133 342** May trips (66.7%); June 133 459; July 128 359. Pickups outside May-July 2026: **2** rows (April 18 and 30) dropped before the split.

**Cross-month drift of the rules (share removed, May / June / July):** flex 23.2 / 26.3 / 27.4% (growing app bookings); non-standard rate 6.7 / 3.5 / 5.0%, driven entirely by `RatecodeID 99` (3.44 / 0.02 / 1.52% of rows), which is a VendorID-1 recording artefact. All other steps differ by < 0.2 points.

**Scope caveat:** steps 2–4 and 7 use fields known only after the trip. They define the scope ("a trip that will be metered at Rate #01"), not model inputs. The deployed quote assumes the app knows the trip is metered. Steps 5 and 8 filter July on the target, which removes ~0.2% of July trips and makes July error very slightly optimistic.

## Split
May = train, June = validation and every choice, July = scored once at the end. By pickup month.

**July disclosure:** July had already been scored once on 2026-11-01 by the skeleton NB04 (linear, f4_shape, unfrozen buffer). All choices since then were made on June. The lock was reset with the project owner's approval, and the frozen configuration was scored once on 2026-11-15 (NB04 §4, `results/july_final.json`).

## Baseline ladder
*Expectations were not written before running (see NB01 §5), so only the actual numbers are reported.*

| Rung | Model | Actual (June MAE) |
|---|---|---|
| 1 | May median fare | 7.901 |
| 2a | TLC rule \$3.00 + \$3.50/mi (official constants) | 4.894 (bias +4.885: misses the time charge) |
| 2b | start + per-mile rule fitted on May (\$6.67 + \$3.99/mi) | 2.979 |
| 3 | decision tree, depth 2 | 3.948 |
| — | **final: gradient boosting, f7_time_x** | **2.082** (July: 2.002) |

## Metric and decision
- Primary: MAE (dollars). Secondary: RMSE (tail) and bias. July: day-block bootstrap CI (2 000 resamples of whole days) of the model vs the median baseline **and** vs the fitted rate rule.
- **Decision:** quote = prediction + buffer. The buffer rule is chosen on June so that actual ≤ quote on 90% of trips, with coverage as even as possible across slices; coverage is then checked on July overall and by slice.
