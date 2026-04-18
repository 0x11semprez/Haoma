"""SHAP pre-computation — Dev 2.

Uses shap.DeepExplainer on the Haoma Index head.
Pre-computes SHAP contributions for the full demo scenario ONCE (not live).
The backend reads the precomputed file during the demo — zero lag risk.

Forbidden: manually hardcoding SHAP values. The pipeline must actually run, just upstream.

See ../../CLAUDE.md section "XAI — SHAP pré-calculé (Dev 2)" for specs.
"""
