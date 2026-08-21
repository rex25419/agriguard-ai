# Model Card: AgriGuard AI Risk Scorer (v1.0.0)

> ⚠️ **HACKATHON PROTOTYPE WARNING:** This model was developed for a hackathon proof-of-concept. It demonstrates a technically sound ML pipeline architecture, not a deployable actuarial model.

## Model Details
- **Model Type:** Gradient Boosting Regressor (scikit-learn)
- **Hyperparameters:** `n_estimators=400`, `max_depth=6`, `learning_rate=0.04`
- **Output:** A continuous drought risk score between 0 and 100 per district.

## Intended Use
To provide a daily, data-driven index of crop stress that drives a parametric smart contract payout curve, enabling fairer, graduated insurance payouts compared to single-threshold binary models.

## Training Data (Synthetic)
For this hackathon, the model was trained entirely on **synthetic data**.
- **Size:** ~3,250 rows simulating 10 Indian districts over 2 growing seasons.
- **Label Generation:** Labels were generated using a physically motivated formula combining rainfall deficit, consecutive dry-day streaks (logistic curve), soil moisture deficit, and heat stress.
- **Robustness:** 200 curated extreme-event rows were injected, and Gaussian noise (σ ≈ 6 points) was added to the labels to prevent trivial overfitting.

## Features & Importances
The model relies on 5 core features to capture both volume and temporal distribution of drought stress:

| Feature | Importance | Description |
|---------|------------|-------------|
| `consecutive_dry_days` | **56.04%** | Streak of days with < 2.5 mm rain. Captures temporal stress better than absolute volume. |
| `rainfall_mm` | **35.08%** | Daily rainfall in millimeters. |
| `current_soil_moisture_index`| **5.42%** | Simulated soil moisture (0=bone dry, 1=field capacity). |
| `temperature_c` | **1.94%** | Daily maximum temperature (°C) capturing heat stress evaporation. |
| `historical_avg_yield` | **1.52%** | District average baseline yield (tonnes/ha). |

## Performance Metrics
- **Train R²:** 0.9847
- **Test R²:** 0.9342
- **Test MAE (Mean Absolute Error):** 4.69 score points

## Limitations & What is NOT Accounted For
1. **Real Meteorological Data:** The model has **not** been trained on live IMD (Indian Meteorological Department) or NDVI satellite data.
2. **Crop Phenology:** The model is agnostic to the crop's growth stage (e.g., germination vs. flowering), which heavily influences actual vulnerability.
3. **Flood Risk:** The model is strictly a drought/heat stress index. Catastrophic crop loss due to waterlogging or floods will not trigger a high risk score.
4. **Spatial Correlation:** Districts are treated independently without spatial spillover effects.

*Production deployment requires at least 5+ years of district-level IMD/NDVI data validated against historical ground-truth crop yields.*
