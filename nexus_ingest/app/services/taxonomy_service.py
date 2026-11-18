from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.config import settings
from app.es_client import get_es

logger = logging.getLogger("nexus_ingest")


class TaxonomyService:
    @staticmethod
    def get_all_domains() -> List[str]:
        es = get_es()
        index = settings.es_taxonomy_index
        result = es.search(
            index=index,
            body={
                "size": 0,
                "aggs": {
                    "unique_domains": {"terms": {"field": "domain", "size": 1000}}
                },
            },
        )
        domains = [
            b["key"] for b in result["aggregations"]["unique_domains"]["buckets"]
        ]
        return sorted(domains)

    @staticmethod
    def get_domain(domain: str) -> Optional[Dict[str, Any]]:
        es = get_es()
        result = es.search(
            index=settings.es_taxonomy_index,
            body={"query": {"term": {"domain": domain}}, "size": 1},
        )
        hits = result["hits"]["hits"]
        return hits[0]["_source"] if hits else None

    @staticmethod
    def list_all() -> List[Dict[str, Any]]:
        es = get_es()
        result = es.search(
            index=settings.es_taxonomy_index,
            body={"query": {"match_all": {}}, "size": 1000},
        )
        return [h["_source"] for h in result["hits"]["hits"]]

    @staticmethod
    def upsert_domain(domain: str, categories: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        es = get_es()
        existing = TaxonomyService.get_domain(domain)
        doc = {
            "domain": domain,
            "categories": categories if categories is not None else (existing or {}).get("categories", []),
        }
        if existing:
            # replace by delete+index for simplicity
            es.delete_by_query(
                index=settings.es_taxonomy_index,
                body={"query": {"term": {"domain": domain}}},
                refresh=True,
            )
        es.index(index=settings.es_taxonomy_index, body=doc, refresh="wait_for")
        return doc

    @staticmethod
    def delete_domain(domain: str) -> int:
        es = get_es()
        result = es.delete_by_query(
            index=settings.es_taxonomy_index,
            body={"query": {"term": {"domain": domain}}},
            refresh=True,
        )
        return int(result.get("deleted", 0))


taxonomy_service = TaxonomyService()
