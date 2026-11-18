from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.config import settings
from app.es_client import get_es, search_by_document_id
from app.services.chunking import split_text_into_chunks
from app.services.embedding import embed_texts
from app.services.threat_library_service import threat_library_service

logger = logging.getLogger("nexus_ingest")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DocumentService:
    def create_raw_document(
        self,
        filename: str,
        raw_text: str,
        document_type: str = "digital",
        source: Optional[str] = None,
        geo_tag: Optional[str] = None,
        content_hash: Optional[str] = None,
        uploaded_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        es = get_es()
        document_id = str(uuid.uuid4())
        text_hash = hashlib.sha256((raw_text or "").encode("utf-8")).hexdigest()
        doc = {
            "document_id": document_id,
            "filename": filename,
            "raw_text": raw_text,
            "status": "pending",
            "document_type": document_type,
            "source": source or "",
            "geo_tag": geo_tag or "",
            "content_hash": content_hash,
            "text_hash": text_hash,
            "uploaded_by": uploaded_by,
            "ingested_at": _utc_now(),
        }
        es.index(index=settings.es_raw_index, id=document_id, body=doc, refresh="wait_for")
        return {
            "document_id": document_id,
            "filename": filename,
            "status": "pending",
            "raw_text_length": len(raw_text or ""),
            "ingested_at": doc["ingested_at"],
        }

    def get_raw_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        hit = search_by_document_id(settings.es_raw_index, document_id)
        if hit:
            return hit["_source"]
        # also try _id == document_id
        es = get_es()
        try:
            resp = es.get(index=settings.es_raw_index, id=document_id)
            return resp.get("_source")
        except Exception:
            return None

    def update_raw_status(self, document_id: str, status: str) -> None:
        hit = search_by_document_id(settings.es_raw_index, document_id)
        es = get_es()
        es_id = hit["_id"] if hit else document_id
        es.update(
            index=settings.es_raw_index,
            id=es_id,
            body={"doc": {"status": status}},
            refresh="wait_for",
        )

    def validate_document(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Write validated doc + run threat library keyword linking."""
        es = get_es()
        document_id = payload["document_id"]
        validated = {
            "document_id": document_id,
            "filename": payload.get("filename") or "",
            "title": payload.get("title") or payload.get("filename") or "Document",
            "full_text": payload["full_text"],
            "domains": payload.get("domains") or [],
            "categories": payload.get("categories") or [],
            "subjects": payload.get("subjects") or [],
            "language": payload.get("language") or "en",
            "source": payload.get("source") or "",
            "geo_tag": payload.get("geo_tag") or "",
            "raw_tags": payload.get("raw_tags") or [],
            "raw_ner": payload.get("raw_ner"),
            "confidence": payload.get("confidence"),
            "validated_at": _utc_now(),
            "linked_threats": [],
            "related_documents": [],
            "probable_threats": [],
        }
        es.index(
            index=settings.es_validated_index,
            id=document_id,
            body=validated,
            refresh="wait_for",
        )

        analysis = threat_library_service.analyze_document(
            document_id=document_id,
            text=validated["full_text"],
            title=validated["title"],
        )
        threat_library_service.persist_links_on_validated(
            document_id=document_id,
            linked_threats=analysis["linked_threats"],
            related_documents=analysis["related_documents"],
            probable_threats=analysis.get("probable_threats") or [],
        )
        validated.update(analysis)
        self.update_raw_status(document_id, "validated")
        return {
            "document_id": document_id,
            "status": "validated",
            "domains": validated["domains"],
            "categories": validated["categories"],
            "subjects": validated["subjects"],
            "linked_threats": analysis["linked_threats"],
            "related_documents": analysis["related_documents"],
        }

    def get_validated_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        hit = search_by_document_id(settings.es_validated_index, document_id)
        if hit:
            return hit["_source"]
        es = get_es()
        try:
            resp = es.get(index=settings.es_validated_index, id=document_id)
            return resp.get("_source")
        except Exception:
            return None

    def process_to_embeddings(self, document_id: str) -> Dict[str, Any]:
        """Chunk validated text → EmbeddingGemma → processed index."""
        validated = self.get_validated_document(document_id)
        if not validated:
            raise ValueError(f"Validated document not found: {document_id}")

        text = validated.get("full_text") or ""
        chunks = split_text_into_chunks(text)
        if not chunks:
            raise ValueError("No chunks produced from document text")

        es = get_es()
        # remove prior chunks for re-process
        es.delete_by_query(
            index=settings.es_processed_index,
            body={"query": {"term": {"document_id": document_id}}},
            refresh=True,
            conflicts="proceed",
        )

        batch_size = settings.embedding_batch_size
        processed_ids: List[str] = []
        for start in range(0, len(chunks), batch_size):
            batch_texts = chunks[start : start + batch_size]
            vectors = embed_texts(batch_texts)
            operations = []
            for i, (chunk_text, vector) in enumerate(zip(batch_texts, vectors)):
                chunk_id = start + i
                doc = {
                    "document_id": document_id,
                    "chunk_id": chunk_id,
                    "chunk_text": chunk_text,
                    "title": validated.get("title"),
                    "domains": validated.get("domains") or [],
                    "categories": validated.get("categories") or [],
                    "subjects": validated.get("subjects") or [],
                    "vector": vector,
                }
                es_id = f"{document_id}_{chunk_id}"
                operations.append({"index": {"_index": settings.es_processed_index, "_id": es_id}})
                operations.append(doc)
                processed_ids.append(es_id)
            es.bulk(operations=operations, refresh=False)

        es.indices.refresh(index=settings.es_processed_index)
        self.update_raw_status(document_id, "processed")
        return {
            "message": "Document processed to embeddings successfully",
            "document_id": document_id,
            "chunks_created": len(chunks),
            "processed_document_ids": processed_ids,
            "status": "processed",
        }


document_service = DocumentService()
