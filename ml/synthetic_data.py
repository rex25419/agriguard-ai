"""
synthetic_data.py
─────────────────
Generates a realistic synthetic dataset of ~2000 rows simulating 10 Indian
agricultural districts across 2 growing seasons (Kharif + Rabi).

Feature columns:
  districtId                    – integer 1-10
  date                          – YYYY-MM-DD
  rainfall_mm                   – daily rainfall in millimetres
  consecutive_dry_days          – consecutive days without meaningful rain (< 2.5 mm)
  temperature_c                 – daily max temperature in Celsius
  historical_avg_yield          – district-level historical average yield (tonnes/ha)
  current_soil_moisture_index   – 0-1 index (1 = field capacity, 0 = bone dry)

Target:
  risk_score  – 0-100 drought/crop-loss risk score

Design rationale
────────────────
The "true" severity uses a physically motivated formula:
  severity = weighted sum of:
    rain_deficit   (shortfall below 10 mm/day)          weight 0.35
    dry_penalty    (logistic on consecutive dry streak)  weight 0.30
    moisture_deficit (1 - SMI)                           weight 0.25
    heat_stress    (temperature above 35 C)              weight 0.10

The raw severity is scaled non-linearly (power 1.3) so extreme events
produce scores above 90, and Gaussian noise (sigma~6) is added so the
model learns a statistical relationship rather than a trivial rule.
"""

import numpy as np
import pandas as pd
from datetime import date, timedelta

SEED = 42
rng = np.random.default_rng(SEED)

DISTRICTS = {
    1:  {"name": "Vidarbha",     "base_rain": 6.0,  "base_temp": 34.0, "avg_yield": 1.2},
    2:  {"name": "Marathwada",   "base_rain": 4.5,  "base_temp": 36.0, "avg_yield": 0.9},
    3:  {"name": "Bundelkhand",  "base_rain": 3.5,  "base_temp": 38.0, "avg_yield": 0.8},
    4:  {"name": "Rayalaseema",  "base_rain": 3.0,  "base_temp": 37.5, "avg_yield": 0.7},
    5:  {"name": "Saurashtra",   "base_rain": 5.0,  "base_temp": 35.0, "avg_yield": 1.0},
    6:  {"name": "North Bihar",  "base_rain": 9.0,  "base_temp": 31.0, "avg_yield": 2.1},
    7:  {"name": "West Bengal",  "base_rain": 11.0, "base_temp": 30.0, "avg_yield": 2.4},
    8:  {"name": "Punjab",       "base_rain": 4.0,  "base_temp": 33.0, "avg_yield": 3.8},
    9:  {"name": "Telangana",    "base_rain": 5.5,  "base_temp": 36.5, "avg_yield": 1.3},
    10: {"name": "Chhattisgarh","base_rain": 8.0,  "base_temp": 32.0, "avg_yield": 1.6},
}

SEASONS = [
    {"start": date(2023, 6, 1),  "end": date(2023, 10, 31)},
    {"start": date(2023, 11, 1), "end": date(2024, 3, 31)},
]


def generate_district_season(district_id: int, info: dict, season: dict) -> pd.DataFrame:
    start, end = season["start"], season["end"]
    n_days = (end - start).days + 1
    dates  = [start + timedelta(days=i) for i in range(n_days)]

    base_rain = info["base_rain"]
    base_temp = info["base_temp"]

    # Rainfall: exponential with district-specific mean; 30-55% dry days
    rain_shape = rng.uniform(0.8, 1.5)
    rainfall = rng.exponential(base_rain * rain_shape, n_days)
    dry_mask = rng.random(n_days) < rng.uniform(0.30, 0.55)
    rainfall = np.where(dry_mask, 0.0, rainfall)
    rainfall = np.clip(rainfall, 0, 120)

    # Consecutive dry days (< 2.5 mm counts as dry)
    consecutive_dry = np.zeros(n_days, dtype=int)
    streak = 0
    for i, r in enumerate(rainfall):
        streak = streak + 1 if r < 2.5 else 0
        consecutive_dry[i] = streak

    # Temperature: sinusoidal seasonal variation + noise
    season_phase = np.linspace(0, np.pi, n_days)
    temp_variation = 4.0 * np.sin(season_phase)
    temperature = base_temp + temp_variation + rng.normal(0, 1.5, n_days)

    # Soil moisture: decays when dry, recovers with rain
    smi = np.zeros(n_days)
    smi[0] = rng.uniform(0.3, 0.7)
    decay_rate = rng.uniform(0.04, 0.08)
    recovery_coeff = rng.uniform(0.05, 0.12)
    for i in range(1, n_days):
        smi[i] = smi[i - 1] * (1 - decay_rate)
        smi[i] += min(rainfall[i] * recovery_coeff, 0.25)
        smi[i] = np.clip(smi[i], 0.0, 1.0)

    # Historical yield: slight inter-annual variation
    avg_yield = info["avg_yield"] * rng.uniform(0.9, 1.1, n_days)

    # ── True severity (label) ──────────────────────────────────────────────────
    rain_deficit     = np.clip((10 - rainfall) / 10, 0, 1)
    dry_penalty      = 1 / (1 + np.exp(-0.4 * (consecutive_dry - 7)))
    moisture_deficit = 1 - smi
    heat_stress      = np.clip((temperature - 35) / 15, 0, 1)

    raw_severity = (
        0.35 * rain_deficit
        + 0.30 * dry_penalty
        + 0.25 * moisture_deficit
        + 0.10 * heat_stress
    )
    # Non-linear scaling (power 1.3) pushes extreme droughts above 90
    scaled = np.power(raw_severity, 1.3)
    # Re-normalise to 0-100; raw_severity max is 1.0, scaled max is 1.0 (power > 1 compresses)
    # We stretch back by dividing by the expected max of 0.85 at full severity
    true_severity = np.clip(scaled / 0.85, 0, 1) * 100
    noise = rng.normal(0, 6, n_days)
    risk_score = np.clip(true_severity + noise, 0, 100)

    return pd.DataFrame({
        "districtId":                    district_id,
        "date":                          [d.isoformat() for d in dates],
        "rainfall_mm":                   np.round(rainfall, 2),
        "consecutive_dry_days":          consecutive_dry,
        "temperature_c":                 np.round(temperature, 1),
        "historical_avg_yield":          np.round(avg_yield, 2),
        "current_soil_moisture_index":   np.round(smi, 3),
        "risk_score":                    np.round(risk_score, 1),
    })


def generate_dataset() -> pd.DataFrame:
    frames = []
    for district_id, info in DISTRICTS.items():
        for season in SEASONS:
            frames.append(generate_district_season(district_id, info, season))
    df = pd.concat(frames, ignore_index=True)
    df = df.sample(frac=1, random_state=SEED).reset_index(drop=True)
    return df


if __name__ == "__main__":
    df = generate_dataset()
    df.to_csv("synthetic_dataset.csv", index=False)
    print(f"Generated {len(df)} rows across {df['districtId'].nunique()} districts.")
    print(df.describe())
    print(f"\nMax risk_score: {df['risk_score'].max():.1f}")
    print(f"Scores above 90: {(df['risk_score'] >= 90).sum()} rows")
