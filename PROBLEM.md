# PROBLEM.md · Fairfare (Task A: The Fare)

> **Owner:** P1 · **Reviewed by:** P2, P3 (attack it for leakage before any modelling) · **Status:** DRAFT

## The question (one sentence)
Given the pickup time, pickup zone, drop-off zone and planned route length known **at booking**, predict the meter's `fare_amount` for a standard metered yellow-taxi trip in New York, so an app can quote a price before the trip starts.

## Moment of prediction: booking
| Known at booking (allowed) | Not known (forbidden) |
|---|---|
| pickup time (hour, weekday) | drop-off time, duration |
| pickup & drop-off zone -> borough, airport flag | tip, total_amount |
| `trip_distance`, **treated as the planned route's length** | tolls, extra, mta_tax, improvement/congestion/airport/cbd fees |
| | `RatecodeID`, `payment_type` (set at trip end / payment) |

- **`trip_distance` assumption:** in the data it is *measured during the trip*. We treat it as a stand-in for the routed distance a booking app would compute. A real route estimate has error, so our results are optimistic by that amount. *(TODO: quantify by adding noise to July distances in NB04, or say we did not.)*
- **`passenger_count`:** excluded. Driver-entered, missing for flex fares, no expected signal. *(TODO: confirm in NB02.)*
- `RatecodeID` / `payment_type` are used **only to define the population**, never as features.

## Target and population decisions
Numbers come from the `clean()` log (NB02). Fill all columns.

| # | Decision | Rows removed | % of input | Why |
|---|---|---|---|---|
| 1 | Unknown/missing zones (264, 265) | | | |
| 2 | Flex fare trips (payment_type 0) | | | app-priced? evidence: $/mile distribution vs metered trips |
| 3 | Payment not card/cash (no charge, dispute, unknown, voided) | | | |
| 4 | Non-standard rate codes (JFK flat, Newark, Nassau/Westchester, negotiated, group) | | | different pricing regime; JFK handled how? |
| 5 | `fare_amount <= 0` | | | population definition (applies identically to all months) |
| 6 | `trip_distance <= 0` | | | |
| 7 | Impossible duration (<1 min or >180 min) | | | validity check only; duration is never a feature |
| 8 | Above May 99.9% caps (distance, fare) | | | caps fitted on May only |

Pickups outside May-July 2026: ____ rows dropped before the split.

## Split
May = train, June = validation and every choice, July = scored once at the end. By pickup month.

## Baseline ladder
| Rung | Model | Expected val MAE (write BEFORE running) | Actual (June) |
|---|---|---|---|
| 1 | May median fare | | |
| 2 | fixed charge + per-mile rule (constants from TLC page or fitted on May) | | |
| 3 | decision tree, depth 2 | | |

## Metric and decision
- Primary: MAE (dollars). Secondary: RMSE (tail). July: bootstrap CI (resampling by day) of model vs median baseline.
- **Decision:** quote = prediction + buffer. Buffer chosen on June so that actual <= quote on 90% of trips; coverage then checked on July and by slice.
