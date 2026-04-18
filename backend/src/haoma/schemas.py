"""Shared Pydantic schemas — the contract between simulator, features, model, xai, api.

Every data structure that crosses module boundaries lives here. Editing this file
impacts all 3 devs — discuss before changing.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AlertLevel = Literal["green", "orange", "red"]
HaomaTrend = Literal["rising", "stable", "falling"]
MacroVitalsState = Literal["nominal", "borderline", "abnormal"]


class VitalsFrame(BaseModel):
    """Raw output of the patient simulator at one timestep."""

    heart_rate: float
    spo2: float
    bp_systolic: float
    bp_diastolic: float
    temp_central: float
    temp_peripheral: float
    perfusion_index: float
    respiratory_rate: float
    # Simulator ground-truths used as weak supervision for the PINN heads.
    # Kept internal — not pushed to the frontend.
    r_sim: float | None = None
    q_sim: float | None = None


class FeatureVector(BaseModel):
    """The 4 features consumed by the PINN."""

    delta_t: float
    hrv_trend_30min: float
    pi_fc_ratio: float
    degradation_slope_30min: float


class PINNOutput(BaseModel):
    """Predictions from the 3-head PINN."""

    resistance: float = Field(..., ge=0.0)
    flow: float = Field(..., ge=0.0)
    haoma_index: float = Field(..., ge=0.0, le=1.0)


class ShapContribution(BaseModel):
    """A feature's contribution to the Haoma Index, explained in plain French."""

    feature: str
    value: float
    label: str


class PhysicsSummary(BaseModel):
    """Physical quantities predicted by the model with percentage change from baseline."""

    resistance: float
    resistance_delta_pct: float
    flow: float
    flow_delta_pct: float


class ProjectedPoint(BaseModel):
    """One forward-looking risk sample.

    Emitted by the PINN (or, for now, by an extrapolation of recent slope).
    Horizon is expressed relative to the current frame so the frontend never
    has to reason about timestamps when drawing the projection.
    """

    seconds_ahead: float = Field(..., ge=0.0)
    score: float = Field(..., ge=0.0, le=100.0)


class DivergenceSignal(BaseModel):
    """"Silent compensation" flag — macro vitals still nominal while the
    Haoma index is climbing. This is the Phase 2 moment of the pitch; we
    surface it server-side so the UI never has to re-derive clinical logic.
    """

    active: bool
    lead_minutes: float | None = None
    rationale: str | None = None


class WebSocketFrame(BaseModel):
    """Full payload pushed to the frontend every 2-3 seconds."""

    timestamp: str
    patient_id: str
    vitals: VitalsFrame
    features: FeatureVector
    physics: PhysicsSummary
    haoma_index: float
    haoma_trend: HaomaTrend
    alert_level: AlertLevel
    macro_vitals_state: MacroVitalsState
    shap_contributions: list[ShapContribution]
    projected_trajectory: list[ProjectedPoint]
    divergence: DivergenceSignal
    recommendation: str


class ScenarioPatient(BaseModel):
    age_years: int
    weight_kg: float
    pathology: str
    baseline: dict[str, float]


class ScenarioPhase(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str
    start_s: int
    end_s: int
    mode: Literal["stable", "degradation", "static"]


class ScenarioTimeline(BaseModel):
    model_config = ConfigDict(extra="allow")

    total_seconds: int
    sampling_hz: int
    phases: list[ScenarioPhase]


class ScenarioConfig(BaseModel):
    """Typed contract for scenario JSON files in haoma/demo/scenarios/."""

    scenario_id: str
    description: str
    seed: int
    patient: ScenarioPatient
    timeline: ScenarioTimeline
    alert_thresholds: dict[str, float]


class PrecomputedFrame(BaseModel):
    """One timestep in a precomputed demo scenario file."""

    t: float
    vitals: VitalsFrame
    features: FeatureVector
    physics: PhysicsSummary
    haoma_index: float
    alert_level: AlertLevel
    shap: list[ShapContribution]


class PrecomputedScenario(BaseModel):
    """Full precomputed scenario file — read by the API in demo mode."""

    scenario_id: str
    total_seconds: int
    frames: list[PrecomputedFrame]
