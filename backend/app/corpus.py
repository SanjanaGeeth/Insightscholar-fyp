from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen

from .config import RAW_CORPUS_CACHE_PATH, SAMPLE_CORPUS_PATH, SERPAPI_API_KEY, SERPAPI_BASE_URL
from .database import Database

_S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"
_S2_HEADERS = {"User-Agent": "InsightScholar/1.0 (FYP research project)"}


def enrich_authors_from_s2(db: Database, paper_ids: list[str]) -> None:
    """Batch-fetch author names from Semantic Scholar for papers that have none, then persist."""
    # Only include numeric IDs (S2ORC corpus IDs)
    numeric_ids = [pid for pid in paper_ids if pid.isdigit()]
    if not numeric_ids:
        return
    try:
        body = json.dumps({"ids": [f"CorpusId:{pid}" for pid in numeric_ids]}).encode()
        req_url = f"{_S2_BATCH_URL}?fields=authors"
        import urllib.request
        req = urllib.request.Request(req_url, data=body, headers={**_S2_HEADERS, "Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=8) as resp:
            items = json.loads(resp.read().decode())
    except Exception:
        return
    # Response items are returned in the same order as the request IDs
    for corpus_id, item in zip(numeric_ids, items):
        if not isinstance(item, dict):
            continue
        authors = [
            a["name"] for a in (item.get("authors") or [])
            if isinstance(a, dict) and a.get("name")
        ]
        if authors:
            paper = db.get_paper(corpus_id)
            if paper and not paper.get("authors"):
                paper["authors"] = authors
                db.upsert_paper(paper)


YEAR_PATTERN = re.compile(r"(19|20)\d{2}")
PLACEHOLDER_HOSTS = {"example.org"}
SERPAPI_PAGE_SIZE = 20
MOJIBAKE_MARKERS = ("\u00c3", "\u00e2", "\u20ac", "\x80", "\x99", "\x9c", "\x9d")
HOST_PATTERN = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$", re.IGNORECASE)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_paper_id(title: str, url: str | None = None) -> str:
    digest = hashlib.sha1(f"{title.strip().lower()}::{(url or '').strip().lower()}".encode("utf-8")).hexdigest()
    return f"paper-{digest[:12]}"


def has_live_serpapi() -> bool:
    return bool(SERPAPI_API_KEY)


def is_placeholder_url(url: str | None) -> bool:
    if not url:
        return False
    try:
        host = (urlparse(str(url)).hostname or "").lower().removeprefix("www.")
    except ValueError:
        return False
    return host in PLACEHOLDER_HOSTS


def _clean_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if any(marker in text for marker in MOJIBAKE_MARKERS):
        try:
            repaired = text.encode("latin-1").decode("utf-8")
            if repaired:
                text = repaired
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return re.sub(r"\s+", " ", text).strip()


def _looks_like_host(value: str) -> bool:
    normalized = _clean_text(value).lower().removeprefix("www.")
    return bool(normalized and HOST_PATTERN.fullmatch(normalized))


def _strip_trailing_year(value: str) -> str:
    return re.sub(r"(?:,\s*|\s+)(19|20)\d{2}$", "", _clean_text(value)).strip(" ,")


def _normalize_authors(raw: dict[str, Any]) -> list[str]:
    publication_info = raw.get("publication_info") or {}
    authors = publication_info.get("authors") or raw.get("authors") or []
    if isinstance(authors, list):
        names = []
        for author in authors:
            if isinstance(author, dict) and author.get("name"):
                names.append(_clean_text(author["name"]))
            elif isinstance(author, str):
                names.append(_clean_text(author))
        names = [name for name in names if name]
        if names:
            return names
    summary = _clean_text(publication_info.get("summary") or raw.get("summary") or "")
    if " - " in summary:
        lead = summary.split(" - ", 1)[0]
        names = [_clean_text(part) for part in lead.split(",") if _clean_text(part)]
        if names:
            return names
    return ["Unknown Author"]


def _extract_year(raw: dict[str, Any]) -> int | None:
    candidates = [
        raw.get("year"),
        (raw.get("publication_info") or {}).get("year"),
        (raw.get("publication_info") or {}).get("summary"),
        raw.get("snippet"),
    ]
    for candidate in candidates:
        if isinstance(candidate, int):
            return candidate
        if isinstance(candidate, str):
            match = YEAR_PATTERN.search(_clean_text(candidate))
            if match:
                return int(match.group(0))
    return None


def _extract_venue(raw: dict[str, Any]) -> str:
    venue = _strip_trailing_year(raw.get("venue") or "")
    if venue:
        return venue
    summary = _clean_text((raw.get("publication_info") or {}).get("summary") or raw.get("summary") or "")
    if not summary:
        return ""
    segments = [_clean_text(segment) for segment in summary.split(" - ") if _clean_text(segment)]
    if len(segments) >= 3:
        candidate = _strip_trailing_year(" - ".join(segments[1:-1]))
        if candidate and not YEAR_PATTERN.fullmatch(candidate) and not _looks_like_host(candidate):
            return candidate
        return ""
    if len(segments) == 2:
        candidate = _strip_trailing_year(segments[1])
        if candidate and not YEAR_PATTERN.fullmatch(candidate) and not _looks_like_host(candidate):
            return candidate
    fallback = _strip_trailing_year(summary)
    return "" if _looks_like_host(fallback) else fallback


def _extract_citations(raw: dict[str, Any]) -> int:
    inline_links = raw.get("inline_links") or {}
    cited_by = inline_links.get("cited_by") or raw.get("cited_by") or {}
    total = cited_by.get("total")
    return int(total or 0)


def normalize_scholar_result(raw: dict[str, Any], default_categories: list[str] | None = None) -> dict[str, Any]:
    title = _clean_text(raw.get("title") or "Untitled Paper")
    url = str(raw.get("link") or raw.get("url") or "").strip() or None
    abstract = _clean_text(raw.get("snippet") or raw.get("abstract") or "No abstract available.")
    citations = _extract_citations(raw)
    categories = [
        _clean_text(category)
        for category in (default_categories or raw.get("categories") or [])
        if _clean_text(category)
    ]
    paper = {
        "paper_id": raw.get("paper_id") or stable_paper_id(title, url),
        "title": title,
        "authors": _normalize_authors(raw),
        "year": _extract_year(raw),
        "venue": _extract_venue(raw),
        "categories": categories,
        "abstract": abstract,
        "url": url,
        "citations": citations,
        "influential_citations": max(0, int(citations * 0.35)),
        "source": _clean_text(raw.get("source", "serpapi")) or "serpapi",
        "raw_payload": raw,
        "indexed_at": utc_now(),
    }
    return paper


def load_sample_corpus(sample_path: str | Path = SAMPLE_CORPUS_PATH) -> list[dict[str, Any]]:
    with Path(sample_path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_seed_corpus(db: Database, sample_path: str | Path = SAMPLE_CORPUS_PATH) -> None:
    papers = [paper for paper in load_sample_corpus(sample_path) if not is_placeholder_url(paper.get("url"))]
    expected_ids = {paper["paper_id"] for paper in papers}
    stale_ids = [
        paper["paper_id"]
        for paper in db.list_papers()
        if is_placeholder_url(paper.get("url")) or (paper.get("source") == "seed" and paper["paper_id"] not in expected_ids)
    ]
    if stale_ids:
        db.remove_papers(stale_ids)
    for paper in papers:
        db.upsert_paper(paper)


def _sample_serpapi_payload(
    query: str,
    fields_of_study: list[str] | None = None,
    *,
    num: int = 10,
    start: int = 0,
) -> dict[str, Any]:
    papers = load_sample_corpus()
    selected = []
    category_filter = set(fields_of_study or [])
    for paper in papers:
        if category_filter and not category_filter.intersection(paper.get("categories", [])):
            continue
        selected.append(
            {
                "title": paper["title"],
                "link": paper.get("url"),
                "snippet": paper.get("abstract"),
                "publication_info": {
                    "summary": f"{', '.join(paper.get('authors', []))} - {paper.get('venue')} - {paper.get('year')}",
                    "authors": [{"name": author} for author in paper.get("authors", [])],
                },
                "inline_links": {
                    "cited_by": {"total": paper.get("citations", 0)},
                },
                "source": "sample",
            }
        )
    bounded_start = max(0, int(start or 0))
    bounded_num = max(1, min(int(num or 10), SERPAPI_PAGE_SIZE))
    return {
        "search_metadata": {
            "status": "sample",
            "query": query,
            "start": bounded_start,
            "requested_num": bounded_num,
        },
        "organic_results": selected[bounded_start : bounded_start + bounded_num],
    }


def _build_serpapi_params(
    query: str,
    *,
    num: int,
    start: int = 0,
    filters: dict[str, Any] | None = None,
    sort_by: str = "relevance",
) -> dict[str, Any]:
    filters = filters or {}
    params: dict[str, Any] = {
        "engine": "google_scholar",
        "q": query,
        "num": max(1, min(int(num or 10), SERPAPI_PAGE_SIZE)),
        "start": max(0, int(start or 0)),
        "hl": "en",
        "api_key": SERPAPI_API_KEY,
    }
    year_min = filters.get("year_min")
    year_max = filters.get("year_max")
    if year_min:
        params["as_ylo"] = int(year_min)
    if year_max:
        params["as_yhi"] = int(year_max)
    if str(sort_by or "relevance").lower() == "recency":
        params["scisbd"] = 2
    return params


def fetch_scholar_results(
    query: str,
    fields_of_study: list[str] | None = None,
    num: int = 10,
    *,
    start: int = 0,
    filters: dict[str, Any] | None = None,
    sort_by: str = "relevance",
) -> dict[str, Any]:
    if not SERPAPI_API_KEY:
        return _sample_serpapi_payload(query, fields_of_study, num=num, start=start)
    params = _build_serpapi_params(query, num=num, start=start, filters=filters, sort_by=sort_by)
    url = f"{SERPAPI_BASE_URL}?{urlencode(params)}"
    try:
        with urlopen(url, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError):
        return _sample_serpapi_payload(query, fields_of_study, num=num, start=start)
    RAW_CORPUS_CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def ingest_query_results(
    db: Database,
    query: str,
    fields_of_study: list[str] | None = None,
    num: int = 10,
    *,
    filters: dict[str, Any] | None = None,
    sort_by: str = "relevance",
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    requested = max(1, min(int(num or 10), 60))
    start = 0
    while len(normalized) < requested:
        batch_size = min(SERPAPI_PAGE_SIZE, requested - len(normalized))
        payload = fetch_scholar_results(
            query,
            fields_of_study,
            num=batch_size,
            start=start,
            filters=filters,
            sort_by=sort_by,
        )
        organic_results = payload.get("organic_results", [])
        if not organic_results:
            break
        for raw in organic_results:
            paper = normalize_scholar_result(raw, default_categories=fields_of_study or [])
            if is_placeholder_url(paper.get("url")) or paper["paper_id"] in seen_ids:
                continue
            db.upsert_paper(paper)
            normalized.append(paper)
            seen_ids.add(paper["paper_id"])
        if not has_live_serpapi() or len(organic_results) < batch_size:
            break
        start += batch_size
    return normalized
