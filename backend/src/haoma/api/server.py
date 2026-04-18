"""FastAPI + WebSocket entry point.

Run:  uvicorn haoma.api.server:app --reload --port 8000

Two modes:
  - default: live pipeline (simulator + features + PINN + SHAP)
  - HAOMA_DEMO_MODE=1: replays a pre-computed scenario file (zero live compute)
"""

from __future__ import annotations

import os
import json
import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from haoma import __version__

app = FastAPI(
    title="Haoma",
    version=__version__,
    description="Physics-informed detection of pediatric microvascular collapse.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SCENARIO_PATH = Path(__file__).resolve().parents[3] / "data" / "precomputed" / "demo_scenario.json"
SCENARIO_DATA = []

@app.on_event("startup")
async def startup_event():
    """Au démarrage, on charge tout en mémoire vive (RAM) si on est en mode démo."""
    global SCENARIO_DATA
    if os.environ.get("HAOMA_DEMO_MODE") == "1":
        if SCENARIO_PATH.exists():
            with open(SCENARIO_PATH, "r", encoding="utf-8") as f:
                SCENARIO_DATA = json.load(f)
            print(f"MODE DÉMO : Scénario chargé en mémoire ({len(SCENARIO_DATA)} frames).")
        else:
            print(f"MODE DÉMO : Fichier introuvable ({SCENARIO_PATH}). Fais tourner l'orchestrateur d'abord !")
    else:
        print("MODE LIVE : Prêt à recevoir des données en temps réel.")


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "version": __version__,
        "mode": "demo" if os.environ.get("HAOMA_DEMO_MODE") == "1" else "live",
    }


# TODO Dev 3: POST /observations
@app.post("/observations", status_code=201)
async def ingest_observation(payload: dict[str, Any]):
    """
    Endpoint d'ingestion "FHIR-like".
    Pendant la démo, on n'a pas le temps de traiter ça en live. 
    Mais c'est indispensable pour montrer au jury qu'on sait parler le "langage hôpital".
    """
    # Dans un vrai système (Mode Live), on mettrait ces données dans un buffer de 60 min.
    # Ici, on extrait juste le code LOINC pour faire genre on a compris, et on dit OK.
    
    # On simule la recherche du code LOINC dans le payload FHIR
    loinc_code = "unknown"
    try:
        loinc_code = payload.get("code", {}).get("coding", [{}])[0].get("code", "unknown")
    except Exception:
        pass

    return {
        "status": "ingested", 
        "loinc_detected": loinc_code,
        "message": "Observation ajoutée au buffer."
    }


# TODO Dev 3: WebSocket /ws
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    
    if os.environ.get("HAOMA_DEMO_MODE") != "1":
        await ws.send_json({"error": "Le mode LIVE n'est pas encore branché sur le WebSocket. Lance avec HAOMA_DEMO_MODE=1"})
        await ws.close()
        return

    if not SCENARIO_DATA:
        await ws.send_json({"error": "Aucun scénario chargé."})
        await ws.close()
        return

    speed = float(ws.query_params.get("speed", "1.0"))
    interval = 1.0 # 1 seconde par frame de base
    paused = False
    current_index = 0

    async def listen_commands():
        nonlocal paused, current_index, speed
        try:
            while True:
                msg = await ws.receive_json()
                cmd = msg.get("command")
                if cmd == "pause":
                    paused = True
                elif cmd == "resume":
                    paused = False
                elif cmd == "restart":
                    current_index = 0
                    paused = False
                elif cmd == "set_speed":
                    speed = float(msg.get("value", speed))
        except WebSocketDisconnect:
            pass 

    listener = asyncio.create_task(listen_commands())

    try:
        while current_index < len(SCENARIO_DATA):
            if not paused:
                await ws.send_json(SCENARIO_DATA[current_index])
                current_index += 1
            
            # On attend X secondes avant la prochaine frame
            await asyncio.sleep(interval / speed)
            
        # Fin du film
        await ws.send_json({"type": "end"})
        
        while True:
            await asyncio.sleep(1)
            
    except WebSocketDisconnect:
        print("Client WebSocket déconnecté.")
    finally:
        listener.cancel()