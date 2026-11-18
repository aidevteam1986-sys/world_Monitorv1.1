# nexus_ingest — portable NEXUS-style document pipeline

From-scratch FastAPI copy of the **NEXUS_BD** ingest flow (scope **B**):

```
Upload → OCR/text → ES raw
      → Qwen + taxonomy (domains/categories/subjects)
      → Threat library keyword links → ES validated
      → Chunk + EmbeddingGemma → ES processed
      → On-demand Qwen gist | summary
```

Copy this whole folder anywhere (`E:\sTRATINT\nexus_ingest`).

---

## Prerequisites

| Service | Role |
|---------|------|
| Elasticsearch 8.x | Indexes for raw / validated / processed / taxonomy / threats |
| vLLM (Qwen) OpenAI-compatible | Auto-tag + gist/summary |
| LiteLLM / embed gateway | `embeddinggemma-300m` at `/v1/embeddings` |
| Docling Serve (optional) | Better digital PDF OCR |
| Nanonets (optional) | Scanned OCR — implement `app/services/nanonets_adapter.py` |

---

## Setup

Prefer the existing conda env **`nexus`**, or any venv:

```bash
conda activate nexus
cd nexus_ingest
pip install -r requirements.txt
copy .env.example .env
# REQUIRED: set ELASTICSEARCH_PASSWORD
# Point Qwen / embed / Docling hosts at this PC (see .env.example for 192.168.18.9)
```

Seed taxonomy (7 dashboard domains) + sample threats:

```bash
python scripts/seed_taxonomy.py
python scripts/seed_threats.py
```

Run API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8088
```

Open docs: http://127.0.0.1:8088/docs  
Health: http://127.0.0.1:8088/health

### WorldMonitor dashboard

1. Set `VITE_NEXUS_INGEST_URL=http://127.0.0.1:8088` in `.env.local`
2. Header **UPLOAD** → `POST /api/v1/ingestion/upload/ingest`
3. Domain panels load from `GET /api/v1/panels/documents?domain=political` (etc.)

---

## API (same shape as NEXUS)

### 1) Upload → raw

`POST /api/v1/ingestion/upload/raw`  
multipart: `file`, optional `document_type=digital|scanned`, `source`, `geo_tag`

### 2) Auto-tag + validate + embed (one shot)

`POST /api/v1/ingestion/validation/auto-tag/document/{document_id}`

Runs:

1. Qwen 3-stage taxonomy tagging  
2. Write validated doc + threat keyword links  
3. Chunk + EmbeddingGemma → processed index  

### 3) Embed only (already validated)

`POST /api/v1/ingestion/processing/process`  
`{"document_id": "..."}`

### 4) Gist / summary (on demand)

`POST /api/v1/production/quick/generate/{document_id}`  
`{"mode": "gist"}` or `{"mode": "summary"}`

### Admin

- `GET/POST/DELETE /api/v1/admin/taxonomy/domains`
- `GET/POST/DELETE /api/v1/admin/threat-library/threats`

---

## Elasticsearch indexes

| Index env | Default | Contents |
|-----------|---------|----------|
| `ES_RAW_INDEX` | `raw_docs_ingest` | pending text |
| `ES_VALIDATED_INDEX` | `validated_docs_ingest` | taxonomy + full_text + linked_threats |
| `ES_PROCESSED_INDEX` | `processed_docs_ingest` | chunks + 768-d vectors |
| `ES_TAXONOMY_INDEX` | `taxonomy_ingest` | domain → category → subject |
| `ES_THREAT_LIBRARY_INDEX` | `threat_library_ingest` | name/aliases/IOCs |

If you share a cluster with NEXUS, **keep these names** (do not use `*_b_div`).

---

## What matches NEXUS_BD

- 3-stage ES pipeline  
- Qwen utility for tagging + gist/summary  
- EmbeddingGemma 768-d via `/v1/embeddings`  
- Taxonomy-constrained domain/category/subject selection  
- Threat library **keyword** linking on validate  

## Intentionally omitted (not scope B)

- SQL Server auth / roles  
- WebSockets / Celery  
- MinIO file store  
- Full RAG chat UI  
- Admin Model Providers UI (use `.env` instead)  

---

## Quick curl smoke test

```bash
# health
curl http://127.0.0.1:8088/health

# upload
curl -F "file=@sample.txt" -F "document_type=digital" \
  http://127.0.0.1:8088/api/v1/ingestion/upload/raw

# use document_id from response
curl -X POST http://127.0.0.1:8088/api/v1/ingestion/validation/auto-tag/document/DOCUMENT_ID

# gist
curl -X POST http://127.0.0.1:8088/api/v1/production/quick/generate/DOCUMENT_ID \
  -H "Content-Type: application/json" -d "{\"mode\":\"gist\"}"
```
