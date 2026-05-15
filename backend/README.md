# InsightScholar Backend

## Run

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --reload --app-dir backend
```

The API serves the React frontend at `http://localhost:8000/api/v1`.

## Environment

- `SERPAPI_API_KEY` enables live Google Scholar ingestion through SerpApi.
- `INSIGHTSCHOLAR_SECRET_KEY` overrides the development token secret.
- `INSIGHTSCHOLAR_ALLOWED_ORIGINS` configures CORS origins.
- `INSIGHTSCHOLAR_EMBEDDING_MODEL` overrides the default SPECTER-family model name.

Without `SERPAPI_API_KEY`, the backend falls back to the seeded local corpus in `backend/data/sample_corpus.json`.

## SerpApi Scholar flow

- `POST /api/v1/search` now refreshes the local corpus from SerpApi before reranking results.
- The backend uses SerpApi's `google_scholar` engine with `q`, `num`, `start`, `as_ylo`, `as_yhi`, and `scisbd=2` for recency sort.
- Live results are normalized into the same local schema, indexed, and explained through the existing retrieval pipeline.
- Search responses include `live_source`, `live_source_enabled`, and `live_refresh_count` so the frontend can tell whether live Scholar refresh ran.

## Notes

- The retrieval stack uses a persisted disk-backed vector store in `backend/data/vector_index.json`.
- If `sentence-transformers` and `faiss-cpu` are installed, the project can be extended to production-grade embeddings and FAISS retrieval without changing the API contract.
- The current reranker is a transparent additive EBM-style model that exposes native term contributions for the app and notebook.
