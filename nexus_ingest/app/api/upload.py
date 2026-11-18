from __future__ import annotations

import asyncio
import hashlib

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.document_service import document_service
from app.services.ocr import extract_text_from_bytes
from app.services.text_cleanup import clean_extracted_text
from app.services.validation_service import validation_service

router = APIRouter(prefix="/upload", tags=["Upload"])


async def _extract_and_create_raw(
    file: UploadFile,
    document_type: str,
    source: str,
    geo_tag: str,
    uploaded_by: str,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    content_hash = hashlib.sha256(content).hexdigest()
    try:
        raw_text = extract_text_from_bytes(file.filename, content, document_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR/extract failed: {exc}") from exc

    if not (raw_text or "").strip():
        raise HTTPException(status_code=400, detail="No text extracted from file")

    return document_service.create_raw_document(
        filename=file.filename,
        raw_text=raw_text,
        document_type=document_type,
        source=source or None,
        geo_tag=geo_tag or None,
        content_hash=content_hash,
        uploaded_by=uploaded_by or None,
    )


@router.post("/raw")
async def upload_to_raw_index(
    file: UploadFile = File(...),
    document_type: str = Form("digital"),
    source: str = Form(""),
    geo_tag: str = Form(""),
    uploaded_by: str = Form(""),
):
    """
    Step 1: Upload → OCR/text extract → ES raw (pending)
    """
    result = await _extract_and_create_raw(file, document_type, source, geo_tag, uploaded_by)
    return {"status": "ok", "data": result}


@router.post("/ingest")
async def upload_and_ingest(
    file: UploadFile = File(...),
    document_type: str = Form("digital"),
    source: str = Form(""),
    geo_tag: str = Form(""),
    uploaded_by: str = Form(""),
):
    """
    One-shot for the dashboard UPLOAD button:
      OCR → ES raw → Qwen auto-tag → validated + threats → embeddings
    """
    raw = await _extract_and_create_raw(file, document_type, source, geo_tag, uploaded_by)
    document_id = raw["document_id"]

    document = await asyncio.to_thread(document_service.get_raw_document, document_id)
    if not document:
        raise HTTPException(status_code=500, detail="Raw document missing after upload")

    text = clean_extracted_text(document.get("raw_text") or "")
    auto_tag_result = await asyncio.to_thread(validation_service.generate_auto_tags, text)
    payload = {
        "document_id": document_id,
        "filename": document.get("filename", ""),
        "full_text": text,
        "title": auto_tag_result.get("title") or document.get("filename", "Document"),
        "domains": auto_tag_result.get("domains", []),
        "categories": auto_tag_result.get("categories", []),
        "subjects": auto_tag_result.get("subjects", []),
        "geo_tag": document.get("geo_tag", "") or geo_tag,
        "language": auto_tag_result.get("language", "en"),
        "source": (document.get("source") or "").strip() or auto_tag_result.get("source", "") or source,
        "raw_tags": auto_tag_result.get("raw_tags", []),
        "raw_ner": auto_tag_result.get("raw_ner"),
        "confidence": auto_tag_result.get("confidence"),
    }

    validation_result = await asyncio.to_thread(
        validation_service.validate_and_save_document, payload
    )
    try:
        processing_result = await asyncio.to_thread(
            document_service.process_to_embeddings, document_id
        )
    except Exception as exc:
        # Validated doc is still usable in panels even if embed fails.
        processing_result = {"status": "error", "detail": str(exc)}

    return {
        "status": "ok",
        "data": {
            "document_id": document_id,
            "filename": raw.get("filename"),
            "domains": validation_result.get("domains") or [],
            "categories": validation_result.get("categories") or [],
            "subjects": validation_result.get("subjects") or [],
            "auto_tag_result": auto_tag_result,
            "validation_result": validation_result,
            "processing_result": processing_result,
        },
    }
