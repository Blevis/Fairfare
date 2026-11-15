# PROJECT_ROADMAP.md · Fairfare

> Audit of the repository as of commit `adec049` (2026-11-15), plus the plan for the remaining work.
> Status markers: ✅ done · 🟡 partial · ❌ missing · ⚠️ broken / inconsistent.

---

## Part A · Audit

### A1. Already implemented ✅

| Area | Where | Notes |
|---|---|---|
| Data download | `data/get_data.py` | Pulls 4 files from a fixed GitHub release; idempotent. |
| Config + leakage blacklist | `src/config.py` | Paths, month split, `FORBIDDEN`, freeze constants. |
| Load + zone join + month split | `src/data.py` | 600 000 raw rows, 200k/month; 2 pickups outside May–July. |
| Cleaning with logged steps | `src/clean.py` | 8 steps; caps fitted on May and reused on June/July. |
| Stateless features, cumulative sets | `src/features.py` | f0→f4; `assert_no_leak` on column names. |
| Pipeline (features → encoders → model) | `src/models.py` | Encoders fitted inside the pipeline, so on May only. |
| Baseline ladder | `src/models.py` | Median, rate rule (fit on May), depth-2 tree. |
| Metrics, day-block bootstrap, slices, buffers, July lock | `src/evaluate.py` | Day-block bootstrap is the right choice for correlated trips. |
| Notebook skeletons 01–04 | `notebooks/` | Code cells run; outputs are saved. |

### A2. Partially implemented 🟡

- **NB01 / PROBLEM.md:** the question, cleaning-decision table and baseline-expectation table are blank or TODO.
- **NB02:** audit and flex analysis ran, but the findings table, the A1–A4 write-ups and the decisions summary are empty.
- **NB03:** the ablation and tree grid ran, but the "ideas to test" (zones, zone pair, time × distance) were never implemented. The "features that lost" table and the Gate-2 justification are empty.
- **NB04:** runs end to end, but `BEST` is still a TODO, the buffer rule was never frozen, the TLC comparison is unfilled, and the interpretation is missing.
- **MODEL_CARD.md / README results:** all blank.
- **Rate rule with TLC constants (rung 2b):** commented out. Verified on 2026-11-15 from the TLC fare page: start **$3.00**, **$0.70 per 1/5 mile** (= $3.50/mi) or per minute in slow traffic. This matches the $0.70 steps in `fare_amount` (7.9, 8.6, 9.3, …).

### A3. Missing ❌

1. **Zone-level information.** Zone IDs are reduced to borough plus an airport flag. Manhattan has 99% of pickups, so borough carries almost no signal. Pickup/drop-off zone and zone-pair target encoding (inside the pipeline) are the obvious next step and were planned in NB03.
2. **A flexible model.** Only OLS and a single decision tree. `HistGradientBoostingRegressor` is in scikit-learn, so it needs no new dependency.
3. **The tuned tree is not the tree used.** The NB03 grid's best (depth 12, leaf 50) sits on the **edge** of the grid, while `MODELS["tree"]` is still depth 8 / leaf 200.
4. **Statistical comparison of candidates on June.** The only CI is model vs median baseline on July. There's none for model vs the strongest baseline (rate rule), and none between candidates.
5. **Error-distribution / bias analysis:** residual histograms, bias by slice on June, and calibration of predictions.
6. **Slice-specific buffer comparison:** the notebook asks for it but never computes it.
7. **`trip_distance` noise sensitivity:** a TODO in PROBLEM.md. The headline assumption (measured distance ≈ planned distance) is never quantified.
8. **Tests.** There are none. Nothing checks the leakage guard, the May-only fitting, or the lock.
9. **Reproducibility details:** unpinned `requirements.txt`, no checksums on downloaded data, no saved results file, runtime "~__ min".

### A4. Broken or inconsistent ⚠️

1. **July has already been scored.** `data/processed/.test_scored` = `2026-11-01T22:34:23`, and NB04's saved outputs contain July metrics (linear, f4_shape: MAE 2.512, coverage 0.924). That run happened **before** Gate 2/3: `BEST` was still a TODO and no buffer rule was frozen. The July set is therefore no longer untouched. Every later decision must come from June alone, and the final report must disclose the earlier look (the `lock_test` docstring and README already require this disclosure if the lock is reset).
2. **`FINAL_MODELS = ("linear", "tree")`** is a pair, while NB04 takes `FINAL_MODELS[0]`. A single final model plus its hyperparameters needs to be frozen.
3. **Cleaning drift is unexplained.** `non_standard_rate` removes 6.7% of May, 3.5% of June and 5.0% of July. The cause is `RatecodeID == 99` ("unknown"): 3.44% of May, 0.02% of June, 1.52% of July. That's a data-quality artefact, not a change in pricing regime, and it isn't documented.
4. **Flex share grows over time:** 23.2% → 26.3% → 27.4% of rows removed. `request_source` is empty for every May row. From June on it is filled **only** for flex rows (HV0003 ≈ 91% in June, plus A, EH0004, CC = app/e-hail dispatch). That supports "flex = app/upfront-priced" but is not recorded. (`RatecodeID 99` in item 3 comes almost entirely from VendorID 1: 6 869 of 6 873 May rows.)
5. **The leak guard checks names only.** A feature *derived* from a forbidden column (e.g. duration) would pass `assert_no_leak`. `passenger_count` is "excluded by team decision" but not in `FORBIDDEN`, and the new `request_source` column isn't either.
6. **The baseline-expectation table says "write BEFORE running"**, but the models have already run. Those cells can no longer be filled honestly as pre-registered predictions.

### A5. Is the methodology statistically sound?

| Aspect | Verdict | Comment |
|---|---|---|
| Temporal split | ✅ Sound | Out-of-time by month; caps learned on May only. |
| Learned transforms on May only | ✅ Sound | OneHot inside the pipeline; target encoding must also go inside (sklearn `TargetEncoder` cross-fits on May). |
| Model selection on June | 🟡 | June is used for tuning, selection *and* buffer choice, so June MAE of the winner is optimistic. Acceptable because July is the honest estimate, but it must be stated. |
| Population defined with post-booking fields | ⚠️ Limitation | `RatecodeID`, `payment_type`, duration and the fare caps are not known at booking, yet they define who is in July's scored population. Fine as a *scope* definition ("standard metered trips"), but the app would also have to know the trip will be metered. Document it. |
| Target-based filters on val/test | 🟡 | `fare > 0` and `fare <= May cap` remove ~0.2% of July based on the target. Small, but they make July error slightly optimistic. Document it. |
| Bootstrap | ✅ Sound | Day-block percentile bootstrap with ~31 blocks. The CI should also be reported vs the **rate rule**, the meaningful competitor. |
| OLS optimises squared error, scored on MAE | 🟡 | Fine. Bias is ~0 on June, and the buffer handles the asymmetry. |
| Multiple comparisons | 🟡 | Many June comparisons. Report June CIs as descriptive, not confirmatory. |

### A6. Does the project meet its stated objectives?

| Objective (PROBLEM.md) | Status |
|---|---|
| Booking-time prediction with no leakage | ✅ in features; 🟡 population definition uses post-booking fields (documented scope). |
| Beat the baseline ladder | ✅ on June (linear 2.59 vs rate rule 2.98 MAE), but no CI vs the rate rule yet. |
| Day-block bootstrap CI vs median baseline on July | ✅ computed once, pre-freeze (see A4.1). |
| Quote = prediction + buffer, 90% coverage, checked by slice | 🟡 Additive buffer computed. Slice coverage drops to 0.82 (10–20 mi, June). No slice-aware alternative tested; rule not frozen. |
| Quantify the planned-distance assumption | ❌ |
| Documentation (PROBLEM, MODEL_CARD, README) | ❌ mostly blank |

---

## Part B · Roadmap

Ordered by scientific risk. Each milestone lists: **Objective · Implementation · Depends on · Output · Acceptance · Verification**.

### M0 · Reproducibility and safety net
- **Objective:** a fresh clone produces the same numbers, and the protocol rules are tested.
- **Implementation:** pin `requirements.txt` to the tested versions. Add SHA-256 checks to `get_data.py`. Add `tests/` with synthetic-data tests: leak guard, May-only cap fitting, the July lock, pipeline fit/predict, invariance of the features to forbidden columns, encoder fitted on train only. Make the tests runnable without pytest (`python -m tests`) and also under pytest. Add `passenger_count` and `request_source` to `FORBIDDEN`.
- **Depends on:** nothing.
- **Output:** `requirements.txt`, `data/get_data.py`, `tests/`.
- **Acceptance:** all tests pass; checksum mismatch aborts the download.
- **Verification:** `python -m tests`; `python data/get_data.py` on existing files reports "verified".

### M1 · Population and cleaning, documented
- **Objective:** every cleaning decision is justified with evidence from May, and the drift across months is explained.
- **Implementation:** NB02 gets the flex evidence (`request_source` cross-tab, $/mile comparison), the `RatecodeID 99` drift table, the filled findings table, the A1–A4 write-ups and the decisions summary. The cleaning *rules* stay unchanged (they hold up).
- **Depends on:** M0.
- **Output:** NB02 narrative; PROBLEM.md decision table filled from the May log.
- **Acceptance:** each of the 8 steps has rows removed, %, and an evidence-backed reason; the cross-month drift is explained.
- **Verification:** the numbers in PROBLEM.md equal `build_datasets()["logs"]["train"]`.

### M2 · Feature engineering (June-judged)
- **Objective:** test the planned ideas and keep only what helps on June.
- **Implementation:** stateless additions in `features.py`: `pu_zone_id`/`do_zone_id`/`zone_pair` as categorical keys, `weekend`, `hour_wk` (hour × weekend), and distance × time-band interactions. Learned additions inside the pipeline: `TargetEncoder` for zones / zone pair, fitted on May with internal cross-fitting. New cumulative feature sets f5–f7.
- **Depends on:** M0.
- **Output:** extended ablation (linear, tree, HGB × f0–f7) in NB03, including losers.
- **Acceptance:** every set passes `assert_no_leak`; the encoders are fitted only in `Pipeline.fit(train)`.
- **Verification:** tests; ablation reproducible with fixed seeds.

### M3 · Model selection and tuning on June
- **Objective:** one final model with justified hyperparameters.
- **Implementation:** an extended tree grid (no edge optimum); a small HGB grid; a paired day-block bootstrap on June for best vs runner-up and best vs the rate rule. Selection rule, **fixed before looking at the results**: take the lowest June MAE; if its MAE gain over the simpler runner-up has a 95% day-block CI that includes 0, take the simpler model.
- **Depends on:** M2.
- **Output:** NB03 sections 2–5; `config.py` freeze of `FINAL_FEATURE_SET`, `FINAL_MODEL` and `FINAL_PARAMS`.
- **Acceptance:** the chosen configuration is not on a grid edge (or the edge is explained); the CI is reported.
- **Verification:** re-running NB03 reproduces the table to 3 decimals.

### M4 · Bias, error distribution and quote calibration on June
- **Objective:** a buffer rule that delivers 90% coverage overall and as evenly as possible across slices, at the lowest over-quote.
- **Implementation:** residual distribution and bias-by-slice plots on June. Compare an additive, a multiplicative, and a per-distance-band additive buffer (coverage per slice + mean over-quote). Run a planned-distance noise sensitivity analysis (multiplicative log-normal noise at 0/5/10/20%, seeded).
- **Depends on:** M3.
- **Output:** NB04 sections 1–3; `config.py` freeze of `BUFFER_RULE` and `BUFFER_Q`.
- **Acceptance:** June coverage is 0.90 by construction; per-slice coverage and cost are reported; the rule is written down before July.
- **Verification:** the buffer is recomputed deterministically from June inside NB04.

### M5 · July, once
- **Objective:** an honest final estimate.
- **Implementation:** `lock_test()`, then MAE/RMSE/bias, day-block CIs vs the median and vs the rate rule, coverage overall and by slice, residual-by-hour (time-charge story), July results saved to `results/july_final.json`.
- **Depends on:** M4 and a **decision on the existing lock** (A4.1): the lock may only be reset with the team's explicit approval, and the earlier pre-freeze look must be disclosed.
- **Output:** NB04 sections 4–6, `results/`.
- **Acceptance:** July evaluated exactly once with the frozen configuration; nothing changed afterwards.
- **Verification:** the lock-file timestamp matches the `results/july_final.json` timestamp.

### M6 · Documentation
- **Objective:** documents that reflect what was actually run.
- **Implementation:** fill PROBLEM.md, MODEL_CARD.md, README (results, runtime, AI declaration), NB01 narrative, this roadmap's status.
- **Depends on:** M1–M5.
- **Acceptance:** every number in the docs traces to a notebook output or `results/`.
- **Verification:** cross-check the headline numbers in the docs against `results/july_final.json`.

---

## Part C · Status

| Milestone | Status |
|---|---|
| M0 Reproducibility | ☐ |
| M1 Cleaning documented | ☐ |
| M2 Features | ☐ |
| M3 Selection | ☐ |
| M4 Calibration | ☐ |
| M5 July | ☐ (blocked on lock decision) |
| M6 Docs | ☐ |
