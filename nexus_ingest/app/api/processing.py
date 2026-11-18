from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from app.services.document_service import document_service

router = APIRouter(prefix="/processing", tags=["Processing"])


@router.post("/process")
async def process_to_embeddings(request: dict):
    """Chunk + EmbeddingGemma → processed index (for already-validated docs)."""
    document_id = request.get("document_id")
    if not document_id:
        raise HTTPException(status_code=400, detail="document_id required")
    try:
        return await asyncio.to_thread(document_service.process_to_embeddings, document_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Processing failed: {exc}") from exc
