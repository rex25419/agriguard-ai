"""
main.py  —  AgriGuard AI Risk Scoring Service
──────────────────────────────────────────────
FastAPI app exposing the trained crop risk model over HTTP.

Endpoints:
  POST /score                       score a single day's readings
  GET  /districts/{id}/history      last 30 synthetic-day scores (for the dashboard chart)
  GET  /model-info                  feature importances + metrics (demo slide)

Run:
  uvicorn main:app --reload
"""

import json
import math
import joblib
import numpy as np
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Constants ─────────────────────────────────────────────────────────────────

FEATURES = [
    "rainfall_mm",
    "consecutive_dry_days",
    "temperature_c",
    "historical_avg_yield",
    "current_soil_moisture_index",
]
MODEL_VERSION = "1.0.0"
MODEL_PATH    = Path(__file__).parent / "model.pkl"
METRICS_PATH  = Path(__file__).parent / "metrics.json"

# ── Load model at startup ──────────────────────────────────────────────────────

if not MODEL_PATH.exists():
    raise RuntimeError(
        "model.pkl not found – run `python3 train_model.py` first."
    )

_model   = joblib.load(MODEL_PATH)
_metrics = json.loads(METRICS_PATH.read_text()) if METRICS_PATH.exists() else {}

# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AgriGuard AI Risk Scoring Service",
    description=(
        "Returns a 0-100 crop risk score for a given district and day's "
        "weather/soil readings using a gradient-boosted ML model trained on "
        "synthetic Indian district data."
    ),
    version=MODEL_VERSION,
)

# CORS: allow all origins for hackathon demo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schemas ────────────────────────────────────────────────────────────────────

class ScoreRequest(BaseModel):
    districtId:            int   = Field(..., ge=1, example=1)
    date:                  str   = Field(..., example="2024-08-15")
    rainfall_mm:           float = Field(..., ge=0, example=2.1)
    consecutive_dry_days:  int   = Field(..., ge=0, example=12)
    temperature_c:         float = Field(...,       example=38.5)
    soil_moisture_index:   float = Field(..., ge=0, le=1, example=0.18)


class ScoreResponse(BaseModel):
    districtId:   int
    riskScore:    int
    confidence:   float
    modelVersion: str


class HistoryPoint(BaseModel):
    date:      str
    riskScore: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _predict(
    rainfall_mm: float,
    consecutive_dry_days: int,
    temperature_c: float,
    historical_avg_yield: float,
    soil_moisture_index: float,
) -> tuple[int, float]:
    """Run the model and return (riskScore_int, confidence_float)."""
    X = np.array([[
        rainfall_mm,
        consecutive_dry_days,
        temperature_c,
        historical_avg_yield,
        soil_moisture_index,
    ]])

    raw_score = float(_model.predict(X)[0])
    risk_score = int(round(max(0, min(100, raw_score))))

    # Confidence: heuristic — how far from ambiguous mid-range (50)?
    # Score near 0 or 100 → high confidence; near 50 → low confidence.
    # Maps to [0.60, 0.99] for demo readability.
    distance_from_mid = abs(risk_score - 50) / 50.0
    confidence = round(0.60 + 0.39 * distance_from_mid, 3)

    return risk_score, confidence


# ── District default yields (same as synthetic_data.py) ───────────────────────
_DISTRICT_YIELDS = {
    1: 1.2, 2: 0.9, 3: 0.8, 4: 0.7, 5: 1.0,
    6: 2.1, 7: 2.4, 8: 3.8, 9: 1.3, 10: 1.6,
}

def _default_yield(district_id: int) -> float:
    return _DISTRICT_YIELDS.get(district_id, 1.5)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/score", response_model=ScoreResponse, summary="Score a single day's readings")
def score(req: ScoreRequest) -> ScoreResponse:
    """
    Takes weather and soil readings for a district on a given date and returns
    a 0-100 risk score.  The oracle relayer calls this endpoint daily and
    signs the returned riskScore before submitting it on-chain.
    """
    avg_yield = _default_yield(req.districtId)
    risk_score, confidence = _predict(
        rainfall_mm           = req.rainfall_mm,
        consecutive_dry_days  = req.consecutive_dry_days,
        temperature_c         = req.temperature_c,
        historical_avg_yield  = avg_yield,
        soil_moisture_index   = req.soil_moisture_index,
    )
    return ScoreResponse(
        districtId   = req.districtId,
        riskScore    = risk_score,
        confidence   = confidence,
        modelVersion = MODEL_VERSION,
    )


@app.get(
    "/districts/{district_id}/history",
    response_model=List[HistoryPoint],
    summary="Last 30 simulated daily scores for the dashboard risk chart",
)
def district_history(district_id: int) -> List[HistoryPoint]:
    """
    Generates a synthetic 30-day history of risk scores for the dashboard
    trend chart.  In production this would query a time-series store of
    oracle submissions.  Here we deterministically re-run the model over
    a realistic parameter sweep so the chart always shows meaningful data.
    """
    if district_id not in range(1, 11):
        raise HTTPException(status_code=404, detail="District not found (valid: 1-10)")

    avg_yield = _default_yield(district_id)
    today     = date.today()
    history   = []

    for offset in range(29, -1, -1):
        day = today - timedelta(days=offset)
        # Simulate a deteriorating drought over the 30-day window
        severity_phase = offset / 29.0  # 1.0 = 30 days ago (wetter), 0.0 = today (drier)
        rainfall   = max(0, 8 * severity_phase + np.random.default_rng(offset + district_id * 100).uniform(-2, 2))
        dry_days   = int((1 - severity_phase) * 14 + np.random.default_rng(offset).integers(0, 4))
        temperature = 33 + (1 - severity_phase) * 6 + float(np.random.default_rng(offset).uniform(-1, 1))
        smi        = max(0.05, 0.6 * severity_phase + float(np.random.default_rng(offset + 50).uniform(-0.1, 0.1)))

        risk_score, _ = _predict(rainfall, dry_days, temperature, avg_yield, smi)
        history.append(HistoryPoint(date=day.isoformat(), riskScore=risk_score))

    return history


@app.get("/model-info", summary="Feature importances and model metrics — for demo slide")
def model_info() -> dict:
    """
    Returns feature importances and training metrics to power the demo slide
    'What is the model looking at?'
    """
    return {
        "modelVersion":      MODEL_VERSION,
        "features":          FEATURES,
        "metrics":           _metrics,
        "description": (
            "Gradient-Boosted Regressor trained on synthetic Indian district "
            "data. Predicts 0-100 crop risk score from daily weather and soil "
            "moisture readings."
        ),
    }


@app.get("/health")
def health():
    return {"status": "ok", "modelVersion": MODEL_VERSION}
