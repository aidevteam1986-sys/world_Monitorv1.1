from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from app.services.document_service import document_service
from app.services.text_cleanup import clean_extracted_text
from app.services.validation_service import validation_service

router = APIRouter(prefix="/validation", tags=["Validation"])


@router.post("/auto-tag/document/{document_id}")
async def generate_auto_tags_for_document(document_id: str):
    """
    Full chain (same as NEXUS):
      1) Qwen 3-stage taxonomy auto-tag
      2) validate → ES validated + threat library keyword links
      3) chunk + EmbeddingGemma → ES processed
    """
    document = await asyncio.to_thread(document_service.get_raw_document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    text = clean_extracted_text(document.get("raw_text") or "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Document has no text to analyze")

    auto_tag_result = await asyncio.to_thread(validation_service.generate_auto_tags, text)

    payload = {
        "document_id": document_id,
        "filename": document.get("filename", ""),
        "full_text": text,
        "title": auto_tag_result.get("title") or document.get("filename", "Document"),
        "domains": auto_tag_result.get("domains", []),
        "categories": auto_tag_result.get("categories", []),
        "subjects": auto_tag_result.get("subjects", []),
        "geo_tag": document.get("geo_tag", ""),
        "language": auto_tag_result.get("language", "en"),
        "source": (document.get("source") or "").strip() or auto_tag_result.get("source", ""),
        "raw_tags": auto_tag_result.get("raw_tags", []),
        "raw_ner": auto_tag_result.get("raw_ner"),
        "confidence": auto_tag_result.get("confidence"),
    }

    validation_result = await asyncio.to_thread(
        validation_service.validate_and_save_document, payload
    )
    processing_result = await asyncio.to_thread(
        document_service.process_to_embeddings, document_id
    )

    return {
        "auto_tag_result": auto_tag_result,
        "validation_result": validation_result,
        "processing_result": processing_result,
    }


@router.post("/validate")
async def validate_document(payload: dict):
    """Manual validate (skip auto-tag); still runs threat library linking."""
    if not payload.get("document_id") or not payload.get("full_text"):
        raise HTTPException(status_code=400, detail="document_id and full_text required")
    payload = {**payload, "full_text": clean_extracted_text(payload.get("full_text"))}
    return await asyncio.to_thread(validation_service.validate_and_save_document, payload)
