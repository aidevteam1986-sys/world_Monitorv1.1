from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings
from app.es_client import ensure_indexes, is_es_available

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nexus_ingest")

app = FastAPI(
    title="NEXUS Ingest Pipeline (portable)",
    description=(
        "From-scratch portable copy of NEXUS_BD ingest flow: "
        "OCR → taxonomy/Qwen tag → threat library links → EmbeddingGemma → ES → Qwen gist/summary"
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_str)


@app.on_event("startup")
def on_startup() -> None:
    if is_es_available():
        ensure_indexes()
        logger.info("Elasticsearch indexes ready")
    else:
        logger.warning("Elasticsearch not reachable at startup — check .env")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "elasticsearch": is_es_available(),
        "indexes": {
            "raw": settings.es_raw_index,
            "validated": settings.es_validated_index,
            "processed": settings.es_processed_index,
            "taxonomy": settings.es_taxonomy_index,
            "threat_library": settings.es_threat_library_index,
        },
    }
