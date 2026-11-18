from __future__ import annotations

import logging
from typing import Optional

import requests

from app.config import settings

logger = logging.getLogger("nexus_ingest")


def openai_headers(api_key: Optional[str] = None) -> dict:
    key = api_key if api_key is not None else settings.vllm_api_key
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


class LLMClient:
    """OpenAI-compatible chat completions client (Qwen via vLLM)."""

    def __init__(
        self,
        model_name: Optional[str] = None,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.model_name = model_name or settings.resolve_tagging_model
        self.base_url = (base_url or settings.util_base).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.vllm_api_key

    def generate(self, prompt: str, temperature: float = 0.2, max_tokens: int = 2048) -> str:
        url = f"{self.base_url}/v1/chat/completions"
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        resp = requests.post(
            url,
            headers=openai_headers(self.api_key),
            json=payload,
            timeout=300,
        )
        if not resp.ok:
            raise RuntimeError(f"LLM error {resp.status_code}: {resp.text[:500]}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    def invoke(self, prompt: str) -> str:
        return self.generate(prompt)
