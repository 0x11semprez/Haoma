"""Shared Pydantic contracts — the interface between simulator, features, model, xai, api.

Every data structure that crosses module boundaries lives here. Editing this file
impacts all 3 devs — discuss before changing.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AlertLevel = Literal["green", "orange", "red"]


class Vitals(BaseModel):
    """Raw vitals snapshot at one timestep."""

    timestamp: float
    patient_id: str
    hr: float
    spo2: float
    bp_sys: float
    bp_dia: float
    rr: float
    t_central: float
    t_periph: float
    pi: float
    rr_intervals: list[float] = Field(default_factory=list)
    pleth_waveform: list[float] | None = None


class Features(BaseModel):
    """The 4 features consumed by the PINN."""

    delta_t: float
    hrv_trend: float
    pi_hr_ratio: float
    degradation_slope: float


class PhysicsOutputs(BaseModel):
    """Physical quantities predicted by the PINN."""

    resistance: float   # R̂
    flow: float         # Q̂


class ShapContribution(BaseModel):
    """A feature's signed contribution to the Haoma Index, explained in French."""

    feature: str
    value: float
    label: str


class WebSocketFrame(BaseModel):
    """Full payload pushed to the frontend every 2-3 seconds."""

    timestamp: float
    patient_id: str
    vitals: Vitals
    features: Features
    physics: PhysicsOutputs
    haoma_index: float
    alert_level: AlertLevel
    shap_contributions: list[ShapContribution]
    recommendation: str | None = None


class DemoTimestep(WebSocketFrame):
    """One timestep in the precomputed demo scenario file.

    The precomputed scenario JSON is a list[DemoTimestep].
    """
