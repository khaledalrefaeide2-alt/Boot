"""AI and retrieval-augmented generation.

Module map:

``providers/``      pluggable LLM and embedding backends (Claude, offline)
``ingest.py``       extract -> clean -> chunk -> embed -> store
``retrieval.py``    hybrid search, reranking, conflict detection, confidence
``safety.py``       prompt-injection defence and post-generation validation
``assistant.py``    the citizen-facing orchestrator
``rumor_analysis.py`` reviewer briefings for submitted claims
"""
