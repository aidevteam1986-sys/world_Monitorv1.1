from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Dict, Optional

from elasticsearch import Elasticsearch

from app.config import settings

logger = logging.getLogger("nexus_ingest")


@lru_cache
def get_es() -> Elasticsearch:
    kwargs: Dict[str, Any] = {
        "hosts": [settings.elasticsearch_url],
        "verify_certs": settings.elasticsearch_verify_certs,
        "request_timeout": 120,
    }
    if settings.elasticsearch_username:
        kwargs["basic_auth"] = (
            settings.elasticsearch_username,
            settings.elasticsearch_password,
        )
    return Elasticsearch(**kwargs)


def is_es_available() -> bool:
    try:
        return bool(get_es().ping())
    except Exception as exc:
        logger.warning("ES ping failed: %s", exc)
        return False


def ensure_indexes() -> None:
    """Create pipeline indexes if missing."""
    es = get_es()
    dims = settings.embedding_dims

    raw_mapping = {
        "mappings": {
            "properties": {
                "document_id": {"type": "keyword"},
                "filename": {"type": "keyword"},
                "raw_text": {"type": "text"},
                "status": {"type": "keyword"},
                "document_type": {"type": "keyword"},
                "source": {"type": "keyword"},
                "geo_tag": {"type": "keyword"},
                "content_hash": {"type": "keyword"},
                "text_hash": {"type": "keyword"},
                "ingested_at": {"type": "date"},
            }
        }
    }
    validated_mapping = {
        "mappings": {
            "properties": {
                "document_id": {"type": "keyword"},
                "filename": {"type": "keyword"},
                "title": {"type": "text"},
                "full_text": {"type": "text"},
                "domains": {"type": "keyword"},
                "categories": {"type": "keyword"},
                "subjects": {"type": "keyword"},
                "language": {"type": "keyword"},
                "source": {"type": "keyword"},
                "geo_tag": {"type": "keyword"},
                "raw_tags": {"type": "keyword"},
                "linked_threats": {"type": "object", "enabled": True},
                "related_documents": {"type": "object", "enabled": True},
                "validated_at": {"type": "date"},
            }
        }
    }
    processed_mapping = {
        "mappings": {
            "properties": {
                "document_id": {"type": "keyword"},
                "chunk_id": {"type": "integer"},
                "chunk_text": {"type": "text"},
                "title": {"type": "text"},
                "domains": {"type": "keyword"},
                "categories": {"type": "keyword"},
                "subjects": {"type": "keyword"},
                "vector": {
                    "type": "dense_vector",
                    "dims": dims,
                    "index": True,
                    "similarity": "cosine",
                    "index_options": {
                        "type": "int8_hnsw",
                        "m": 16,
                        "ef_construction": 100,
                    },
                },
            }
        }
    }
    taxonomy_mapping = {
        "mappings": {
            "dynamic": True,
            "properties": {
                "domain": {"type": "keyword"},
                "categories": {"type": "object", "enabled": True},
            },
        }
    }
    threat_mapping = {
        "mappings": {
            "dynamic": True,
            "properties": {
                "threat_id": {"type": "keyword"},
                "name": {"type": "keyword"},
                "aliases": {"type": "keyword"},
                "iocs": {"type": "keyword"},
                "threat_type": {"type": "keyword"},
                "severity": {"type": "keyword"},
                "description": {"type": "text"},
            },
        }
    }

    specs = [
        (settings.es_raw_index, raw_mapping),
        (settings.es_validated_index, validated_mapping),
        (settings.es_processed_index, processed_mapping),
        (settings.es_taxonomy_index, taxonomy_mapping),
        (settings.es_threat_library_index, threat_mapping),
    ]
    for name, body in specs:
        if not es.indices.exists(index=name):
            es.indices.create(index=name, body=body)
            logger.info("Created index %s", name)


def search_by_document_id(index: str, document_id: str, size: int = 1) -> Optional[Dict[str, Any]]:
    result = get_es().search(
        index=index,
        body={"query": {"term": {"document_id": document_id}}, "size": size},
    )
    hits = result.get("hits", {}).get("hits", [])
    return hits[0] if hits else None
