Temp readme
# Fairfare: predicting the New York taxi fare at booking

Project 1 · Task A "The Fare" · team: Blevis Allushi, Geri Belba, Leandra Latifi

Predict the meter's `fare_amount` of a standard yellow-taxi trip at booking time, from pickup time, zones and planned distance. May = train, June = validation, July = one final test.

## Run everything from a fresh clone
```bash
git clone <repo-url> && cd fairfare
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python data/get_data.py                                # downloads data/raw/
jupyter nbconvert --to notebook --execute --inplace notebooks/0*.ipynb   # or open them in order
```
Order: `01-frame` -> `02-clean-and-split` -> `03-features` -> `04-evaluate`. Runtime: ~__ min.
Note: `04-evaluate` scores July once (`src.evaluate.lock_test`). To re-run it, delete `data/processed/.test_scored`.

## Layout
| Path | Contents |
|---|---|
| `PROBLEM.md`, `MODEL_CARD.md` | problem card, model card |
| `notebooks/` | the four stage notebooks |
| `src/` | `data.py` load/split, `clean.py` cleaning, `features.py`, `models.py` pipelines + baselines, `evaluate.py` metrics/bootstrap/buffer |
| `data/get_data.py` | downloads raw data (raw data is git-ignored) |

## Results (July, scored once)
*(paste the headline table from NB04)*

## AI use declaration
AI was used, I will elaborate later on what I mean by this.
- ...

## Team
| Member | Main responsibility |
|---|---|
| Blevis | |
| Geri | |
| Leandra | |
