from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Optional

import requests

from app.config import settings
from app.services.text_cleanup import clean_extracted_text

logger = logging.getLogger("nexus_ingest")


def extract_text_from_bytes(
    filename: str,
    content: bytes,
    document_type: str = "digital",
) -> str:
    """
    OCR / text extraction.
    - scanned + USE_NANONETS: tries local Nanonets if available
    - digital + DOCLING_SERVE_URL: Docling Serve convert
    - fallback: pypdf / python-docx / utf-8

    Always strips embedded data-URI / base64 image noise before return so
    ES storage and auto-tag see prose, not binary blobs.
    """
    suffix = Path(filename).suffix.lower()
    document_type = (document_type or "digital").lower()
    text: Optional[str] = None

    if document_type == "scanned" and settings.use_nanonets:
        text = _try_nanonets(content, suffix)

    if not text and settings.docling_serve_url and suffix in {
        ".pdf",
        ".docx",
        ".doc",
        ".png",
        ".jpg",
        ".jpeg",
        ".tif",
        ".tiff",
    }:
        text = _try_docling(filename, content)

    if not text:
        text = _local_fallback(filename, content, suffix)

    return clean_extracted_text(text)


def _try_docling(filename: str, content: bytes) -> Optional[str]:
    base = settings.docling_serve_url.rstrip("/")
    url = f"{base}/v1/convert/file"
    try:
        files = {"files": (filename, content)}
        data = {
            "to_formats": "md",
            "do_ocr": str(settings.docling_enable_ocr).lower(),
            # Prefer placeholders over inlined base64 (ignored if unsupported).
            "image_export_mode": "placeholder",
        }
        resp = requests.post(url, files=files, data=data, timeout=settings.docling_document_timeout)
        if not resp.ok:
            logger.warning("Docling failed %s: %s", resp.status_code, resp.text[:300])
            return None
        payload = resp.json()
        # Docling Serve shapes vary; try common keys
        doc = payload.get("document") or payload
        for key in ("md_content", "text_content", "markdown", "text"):
            if isinstance(doc, dict) and doc.get(key):
                return str(doc[key])
        if isinstance(payload.get("md_content"), str):
            return payload["md_content"]
        logger.warning("Docling response had no text fields")
        return None
    except Exception as exc:
        logger.warning("Docling error: %s", exc)
        return None


def _try_nanonets(content: bytes, suffix: str) -> Optional[str]:
    """Optional path — only if strategy OCR package is available in PYTHONPATH."""
    try:
        # Soft import so this portable repo works without Nanonets weights.
        from app.services.nanonets_adapter import run_nanonets  # type: ignore

        with tempfile.NamedTemporaryFile(suffix=suffix or ".pdf", delete=False) as tmp:
            tmp.write(content)
            path = tmp.name
        return run_nanonets(path)
    except Exception as exc:
        logger.warning("Nanonets unavailable/failed (%s); falling back", exc)
        return None


def _local_fallback(filename: str, content: bytes, suffix: str) -> str:
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
            import io

            reader = PdfReader(io.BytesIO(content))
            parts = []
            for page in reader.pages:
                parts.append(page.extract_text() or "")
            text = "\n".join(parts).strip()
            if text:
                return text
        except Exception as exc:
            logger.warning("pypdf failed: %s", exc)

    if suffix in {".docx"}:
        try:
            import io
            from docx import Document

            doc = Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs if p.text).strip()
        except Exception as exc:
            logger.warning("python-docx failed: %s", exc)

    # plain text / unknown
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return content.decode(enc)
        except Exception:
            continue
    return content.decode("utf-8", errors="replace")
