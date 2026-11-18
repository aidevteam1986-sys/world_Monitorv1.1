from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Elasticsearch
    elasticsearch_url: str = "https://127.0.0.1:9200"
    elasticsearch_username: str = "elastic"
    elasticsearch_password: str = ""
    elasticsearch_verify_certs: bool = False

    es_raw_index: str = "raw_docs_ingest"
    es_validated_index: str = "validated_docs_ingest"
    es_processed_index: str = "processed_docs_ingest"
    es_taxonomy_index: str = "taxonomy_ingest"
    es_threat_library_index: str = "threat_library_ingest"

    # LLM (Qwen via vLLM / OpenAI-compatible)
    vllm_base_url: str = "http://127.0.0.1:8000"
    vllm_util_base_url: str = ""
    vllm_api_key: str = ""
    util_model: str = "qwen-27b"
    tagging_model: str = ""
    quick_actions_model: str = ""

    # Embeddings (Gemma)
    vllm_embed_base_url: str = "http://127.0.0.1:4000"
    embedding_model: str = "embeddinggemma-300m"
    embedding_dims: int = 768
    embedding_batch_size: int = 16
    max_tokens_per_chunk: int = 1500
    text_splitter_overlap_ratio: float = 0.15

    # OCR
    docling_serve_url: str = ""
    docling_enable_ocr: bool = True
    docling_document_timeout: float = 1800.0
    use_nanonets: bool = False

    api_v1_str: str = "/api/v1"

    @property
    def util_base(self) -> str:
        return (self.vllm_util_base_url or self.vllm_base_url).rstrip("/")

    @property
    def resolve_tagging_model(self) -> str:
        return self.tagging_model or self.util_model

    @property
    def resolve_quick_model(self) -> str:
        return self.quick_actions_model or self.util_model


@lru_cache
def get_settings() -> Settings:
    # Allow bool-ish env for verify certs
    if "ELASTICSEARCH_VERIFY_CERTS" in os.environ:
        os.environ["ELASTICSEARCH_VERIFY_CERTS"] = (
            "true"
            if os.environ["ELASTICSEARCH_VERIFY_CERTS"].lower() in ("1", "true", "yes")
            else "false"
        )
    return Settings()


settings = get_settings()
