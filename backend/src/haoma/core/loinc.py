"""LOINC codes used in Haoma's FHIR-like API payloads.

Single source of truth — every module that tags a measurement imports from here.
Reference: https://loinc.org/
"""

from __future__ import annotations

from typing import Final

LOINC: Final[dict[str, str]] = {
    "hr":        "8867-4",    # Heart rate
    "spo2":      "2708-6",    # Oxygen saturation
    "bp_sys":    "8480-6",    # Systolic blood pressure
    "bp_dia":    "8462-4",    # Diastolic blood pressure
    "rr":        "9279-1",    # Respiratory rate
    "t_central": "8329-5",    # Body temperature — core
    "t_periph":  "8310-5",    # Body temperature — peripheral / skin
    "pi":        "61006-3",   # Perfusion index
}
