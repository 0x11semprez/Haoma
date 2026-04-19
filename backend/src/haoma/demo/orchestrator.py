"""Demo orchestrator — génère un mock JSON, le lit, et envoie les frames.

Owner: Dev 3. Zero live compute during the jury demo.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterator
from pathlib import Path

# Assure-toi que ton fichier schemas.py est bien configuré pour importer ça
from haoma.schemas import DemoTimestep

PRECOMPUTED_DIR = Path(__file__).resolve().parents[3] / "data" / "precomputed"

# 1. LE STUDIO DE CINÉMA (Génération de la fausse démo)
def generate_mock_scenario(n_frames: int = 360) -> list[dict]:
    """
    Génère 360 frames (6 minutes) de fausses données médicales.
    Ce script triche intelligemment : il utilise une courbe "sigmoïde"
    (ça va bien, puis ça chute d'un coup) pour simuler l'effondrement de l'enfant.
    """
    frames = []

    for i in range(n_frames):
        t = float(i)
        
        # d = Le facteur de dégradation (de 0.0 à 1.0). 
        # Ça reste proche de 0, puis vers la frame 200, ça grimpe en flèche.
        d = 1.0 / (1.0 + math.exp(-0.03 * (t - 200)))

        # Constantes vitales plausibles pour un enfant de 4 ans
        hr = 98 + d * 40 * (1 - d**3)       # Le cœur accélère
        spo2 = 97 - (d**2.5) * 8            # L'oxygène baisse un peu à la fin
        bp_sys = 90 + d * 12 * (1 - d**2) - (d**3) * 35  # La tension compense puis chute
        bp_dia = 56 + d * 6 * (1 - d**2) - (d**3) * 18
        rr = 26 + d * 14                    # La respiration s'accélère
        t_central = 37.2 + d * 0.5          # Le tronc chauffe
        t_periph = 36.8 - d * 3.0           # Les pieds deviennent glacés (vasoconstriction)
        pi = 3.0 * (1 - 0.75 * d)           # La perfusion s'effondre

        # Le score de notre IA (Haoma Index) - Il monte avant que la tension chute !
        haoma = min(0.95, 0.05 + d * 0.9)

        # Les 3 niveaux d'alerte pour le frontend
        if haoma < 0.3:
            alert = "green"
        elif haoma < 0.6:
            alert = "orange"
        else:
            alert = "red"

        # Physique (R et Q) pour faire plaisir au jury
        r_val = 1.0 * (1 + 3 * d)
        q_val = (bp_sys - bp_dia) / r_val

        # On construit la frame exacte que le frontend attend
        frame = {
            "timestamp": t,
            "patient_id": "demo_patient_01",
            "vitals": {
                "timestamp": t,
                "patient_id": "demo_patient_01",
                "hr": round(hr, 1),
                "spo2": round(spo2, 1),
                "bp_sys": round(bp_sys, 1),
                "bp_dia": round(bp_dia, 1),
                "rr": round(rr, 1),
                "t_central": round(t_central, 2),
                "t_periph": round(t_periph, 2),
                "pi": round(pi, 2),
                "rr_intervals": [],
                "pleth_waveform": None,
            },
            "features": {
                "delta_t": round(t_central - t_periph, 2),
                "hrv_trend": round(-0.5 * d, 3),
                "pi_hr_ratio": round(pi / hr, 4),
                "degradation_slope": round(d * 0.8, 3),
            },
            "physics": {
                "resistance": round(r_val, 2),
                "flow": round(q_val, 2),
            },
            "haoma_index": round(haoma, 3),
            "alert_level": alert,
            "shap_contributions": [
                {
                    "feature": "delta_t",
                    "value": round(0.4 * d, 3),
                    "label": "Gradient thermique en hausse (pieds froids)"
                },
                {
                    "feature": "hrv_trend",
                    "value": round(0.3 * d, 3),
                    "label": "Variabilité cardiaque en baisse"
                }
            ],
            "recommendation": (
                "Évaluer remplissage vasculaire. Choc imminent." if alert == "red" else None
            ),
        }
        frames.append(frame)

    return frames


# 2. (Le lecteur de cassette)
def load_scenario(filename: str = "demo_scenario.json") -> list[DemoTimestep]:
    """Lit le fichier JSON et le valide avec Pydantic."""
    path = PRECOMPUTED_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Fichier {path} introuvable. Lance orchestrator.py d'abord !")
    
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    return [DemoTimestep.model_validate(frame) for frame in raw]

def replay(filename: str = "demo_scenario.json") -> Iterator[DemoTimestep]:
    """Yield les frames une par une."""
    yield from load_scenario(filename)


# 3. LE BOUTON "PLAY" POUR CRÉER LE FICHIER
if __name__ == "__main__":
    print("Génération du scénario mock...")
    
    PRECOMPUTED_DIR.mkdir(parents=True, exist_ok=True)
    
    # On génère les fausses données
    fake_frames = generate_mock_scenario(n_frames=360)
    
    # On sauvegarde le fichier
    output_path = PRECOMPUTED_DIR / "demo_scenario.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(fake_frames, f, indent=2, ensure_ascii=False)
        
    print(f"Fichier créé avec succès : {output_path}")
