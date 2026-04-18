"""LOINC codes used in Haoma's FHIR-like API payloads.

Single source of truth — Dev 1 and Dev 3 import from here. No magic strings elsewhere.
Reference: https://loinc.org/
"""

from __future__ import annotations

from typing import Final

HEART_RATE: Final[str] = "8867-4"
SPO2: Final[str] = "2708-6"
BP_SYSTOLIC: Final[str] = "8480-6"
BP_DIASTOLIC: Final[str] = "8462-4"
TEMP_CENTRAL: Final[str] = "8329-5"
TEMP_PERIPHERAL: Final[str] = "8310-5"
PERFUSION_INDEX: Final[str] = "61006-3"
RESPIRATORY_RATE: Final[str] = "9279-1"


VITAL_DISPLAY: Final[dict[str, str]] = {
    HEART_RATE: "Heart rate",
    SPO2: "Oxygen saturation",
    BP_SYSTOLIC: "Systolic blood pressure",
    BP_DIASTOLIC: "Diastolic blood pressure",
    TEMP_CENTRAL: "Body temperature (core)",
    TEMP_PERIPHERAL: "Skin temperature (peripheral)",
    PERFUSION_INDEX: "Perfusion index",
    RESPIRATORY_RATE: "Respiratory rate",
}

VITAL_UNIT: Final[dict[str, str]] = {
    HEART_RATE: "/min",
    SPO2: "%",
    BP_SYSTOLIC: "mm[Hg]",
    BP_DIASTOLIC: "mm[Hg]",
    TEMP_CENTRAL: "Cel",
    TEMP_PERIPHERAL: "Cel",
    PERFUSION_INDEX: "{score}",
    RESPIRATORY_RATE: "/min",
}
