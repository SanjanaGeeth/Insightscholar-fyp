from __future__ import annotations

import time
from typing import Any

from fastapi import BackgroundTasks, Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import ALLOWED_ORIGINS, DB_PATH
from .corpus import ensure_seed_corpus, enrich_authors_from_s2, has_live_serpapi, ingest_query_results
from .database import Database
from .retrieval import SearchService


db = Database(DB_PATH)
ensure_seed_corpus(db)
search_service = SearchService(db)
search_service.warm_up()

app = FastAPI(title='InsightScholar Backend', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def _guest_user() -> dict[str, Any]:
    return db.get_guest_user()


@app.get('/api/v1/health')
def health() -> dict[str, Any]:
    return {
        'status': 'ok',
        'live_source_enabled': has_live_serpapi(),
        'live_source': 'serpapi/google_scholar' if has_live_serpapi() else 'seed',
        'embedding_backend': search_service.index.encoder.backend,
        'index_backend': search_service.index.backend,
        'reranker_backend': search_service.reranker.backend,
    }


@app.post('/api/v1/auth/register')
def register_user() -> dict[str, Any]:
    raise HTTPException(status_code=410, detail='Authentication has been removed from this build')


@app.post('/api/v1/auth/login')
def login_user() -> dict[str, Any]:
    raise HTTPException(status_code=410, detail='Authentication has been removed from this build')


@app.get('/api/v1/auth/me')
def get_profile() -> dict[str, Any]:
    raise HTTPException(status_code=410, detail='Authentication has been removed from this build')


def _background_ingest(
    query: str,
    fields_of_study: list[str] | None,
    filters: dict[str, Any],
    sort_by: str,
) -> None:
    try:
        ingested = ingest_query_results(db, query, fields_of_study, num=20, filters=filters, sort_by=sort_by)
        if ingested:
            search_service.update_with_new_papers(ingested)
    except Exception:
        pass


@app.post('/api/v1/search')
def search_papers(
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] = Body(...),
    authorization: str | None = None,
) -> dict[str, Any]:
    query = str(payload.get('query') or '').strip()
    if not query:
        raise HTTPException(status_code=400, detail='Search query is required')
    top_k = int(payload.get('top_k') or 10)
    filters = payload.get('filters') or {}
    model = str(payload.get('model') or 'specter')
    ranking_method = str(payload.get('ranking_method') or 'hybrid')
    sort_by = str(payload.get('sort_by') or 'relevance')
    fields_of_study = payload.get('fields_of_study') or None
    use_live_source = bool(payload.get('use_live_source', True))
    started_at = time.perf_counter()
    results = search_service.search(query, top_k, filters, model, ranking_method, sort_by, fields_of_study)

    # Enrich any result papers that are missing authors, then patch them in-place
    missing_author_ids = [
        item["paper"]["paper_id"]
        for item in results.get("results", [])
        if not item.get("paper", {}).get("authors")
    ]
    if missing_author_ids:
        enrich_authors_from_s2(db, missing_author_ids)
        for item in results.get("results", []):
            pid = item.get("paper", {}).get("paper_id", "")
            if pid in missing_author_ids:
                refreshed = db.get_paper(pid)
                if refreshed and refreshed.get("authors"):
                    item["paper"]["authors"] = refreshed["authors"]

    results['processing_time'] = round(time.perf_counter() - started_at, 4)
    results['live_refresh_count'] = 0
    results['live_source_enabled'] = has_live_serpapi()
    results['live_source'] = 'serpapi/google_scholar' if has_live_serpapi() else 'seed'
    if use_live_source and has_live_serpapi():
        background_tasks.add_task(_background_ingest, query, fields_of_study, filters, sort_by)
    guest_user = _guest_user()
    db.add_search_history(
        int(guest_user['id']),
        query,
        len(results['results']),
        model,
        ranking_method,
        {
            'filters': filters,
            'sort_by': sort_by,
            'fields_of_study': fields_of_study or [],
        },
        time.strftime('%Y-%m-%dT%H:%M:%SZ'),
    )
    return results


@app.get('/api/v1/paper/{paper_id}')
def get_paper(paper_id: str) -> dict[str, Any]:
    paper = db.get_paper(paper_id)
    if paper is None:
        raise HTTPException(status_code=404, detail='Paper not found')
    return paper


@app.post('/api/v1/explain')
def explain_paper(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    paper_id = str(payload.get('paper_id') or '').strip()
    query = str(payload.get('query') or '').strip()
    method = str(payload.get('method') or 'keywords')
    if not paper_id or not query:
        raise HTTPException(status_code=400, detail='paper_id and query are required')
    try:
        return search_service.explain(paper_id, query, method)
    except KeyError as error:
        raise HTTPException(status_code=404, detail='Paper not found') from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f'Unsupported explanation method: {method}') from error


@app.get('/api/v1/stats')
def get_stats() -> dict[str, Any]:
    return {
        'total_papers': db.count_papers(),
        'indexed_papers': db.count_papers(),
        'total_users': db.count_users(),
        'total_bookmarks': db.count_bookmarks(),
        'live_source_enabled': has_live_serpapi(),
        'live_source': 'serpapi/google_scholar' if has_live_serpapi() else 'seed',
        'embedding_backend': search_service.index.encoder.backend,
        'index_backend': search_service.index.backend,
        'reranker_backend': search_service.reranker.backend,
    }


@app.get('/api/v1/bookmarks')
def list_bookmarks() -> list[dict[str, Any]]:
    guest_user = _guest_user()
    return db.list_bookmarks(int(guest_user['id']))


@app.post('/api/v1/bookmarks')
def add_bookmark(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    guest_user = _guest_user()
    paper_id = str(payload.get('paper_id') or '').strip()
    if not paper_id or db.get_paper(paper_id) is None:
        raise HTTPException(status_code=404, detail='Paper not found')
    query = str(payload.get('query') or '')
    notes = str(payload.get('notes') or '')
    return db.add_bookmark(int(guest_user['id']), paper_id, query, notes, time.strftime('%Y-%m-%dT%H:%M:%SZ'))


@app.delete('/api/v1/bookmarks/{paper_id}')
def remove_bookmark(paper_id: str) -> dict[str, Any]:
    guest_user = _guest_user()
    removed = db.remove_bookmark(int(guest_user['id']), paper_id)
    if not removed:
        raise HTTPException(status_code=404, detail='Bookmark not found')
    return {'removed': True, 'paper_id': paper_id}


@app.get('/api/v1/history')
def get_history(limit: int = 50) -> list[dict[str, Any]]:
    guest_user = _guest_user()
    return db.list_search_history(int(guest_user['id']), max(1, min(limit, 100)))


@app.delete('/api/v1/history/{entry_id}')
def delete_history_entry(entry_id: int) -> dict[str, Any]:
    guest_user = _guest_user()
    deleted = db.delete_search_history_entry(int(guest_user['id']), entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='History entry not found')
    return {'deleted': True, 'id': entry_id}


@app.delete('/api/v1/history')
def clear_history() -> dict[str, Any]:
    guest_user = _guest_user()
    cleared = db.clear_search_history(int(guest_user['id']))
    return {'cleared': cleared}
