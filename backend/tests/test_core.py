from __future__ import annotations

import json
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from app import corpus as corpus_module
from app import main as main_module
from app.corpus import ensure_seed_corpus, fetch_scholar_results, ingest_query_results, normalize_scholar_result
from app.database import Database
from app.retrieval import SearchService
from app.security import create_access_token, decode_access_token, hash_password, verify_password


class SecurityTests(unittest.TestCase):
    def test_password_round_trip(self) -> None:
        stored_hash = hash_password("super-secret")
        self.assertTrue(verify_password("super-secret", stored_hash))
        self.assertFalse(verify_password("wrong-password", stored_hash))

    def test_token_round_trip(self) -> None:
        token = create_access_token({"id": 7, "username": "alice", "email": "alice@example.com"})
        decoded = decode_access_token(token)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["sub"], 7)


class CorpusAndSearchTests(unittest.TestCase):
    def setUp(self) -> None:
        runtime_root = (Path.cwd() / 'backend' / 'data' / 'test-runtime').resolve()
        runtime_root.mkdir(parents=True, exist_ok=True)
        self.db_path = runtime_root / 'test.db'
        self.index_path = runtime_root / 'vector_index.json'
        if self.db_path.exists():
            self.db_path.unlink()
        if self.index_path.exists():
            self.index_path.unlink()
        self.db = Database(self.db_path)
        ensure_seed_corpus(self.db)
        self.service = SearchService(self.db, self.index_path)

    def tearDown(self) -> None:
        if self.db_path.exists():
            self.db_path.unlink()
        if self.index_path.exists():
            self.index_path.unlink()

    def test_seed_corpus_search_returns_ranked_results(self) -> None:
        response = self.service.search("transformer models", top_k=5, filters={}, ranking_method="hybrid")
        self.assertGreater(len(response["results"]), 0)
        self.assertEqual(response["results"][0]["rank"], 1)
        self.assertIn("paper", response["results"][0])
        self.assertIn("explanation", response["results"][0])
        self.assertGreater(len(response["results"][0]["explanation"].get("evidence_spans", [])), 0)
        self.assertFalse(any('example.org' in (item['paper'].get('url') or '') for item in response['results']))

    def test_explanations_are_grounded_in_paper_text(self) -> None:
        search = self.service.search("explainable AI", top_k=1)
        result = search["results"][0]
        paper = result["paper"]
        overview = result["explanation"]
        ebm = self.service.explain(paper["paper_id"], "explainable AI", "ebm")
        anchors = self.service.explain(paper["paper_id"], "explainable AI", "anchors")

        self.assertTrue(any(span["source"] == "title" for span in overview["evidence_spans"]))
        self.assertIn(paper["title"], [span["text"] for span in overview["evidence_spans"] if span["source"] == "title"])
        self.assertGreater(len(ebm["evidence_spans"]), 0)
        self.assertIn("Suggested because", ebm["explanation_text"])
        self.assertGreater(len(anchors["anchor_rules"]), 0)
        self.assertFalse(any("score is" in rule for rule in anchors["anchor_rules"]))

    def test_explain_supports_ebm_and_shap_alias(self) -> None:
        search = self.service.search("explainable AI", top_k=1)
        paper_id = search["results"][0]["paper"]["paper_id"]
        ebm = self.service.explain(paper_id, "explainable AI", "ebm")
        shap_alias = self.service.explain(paper_id, "explainable AI", "shap")
        anchors = self.service.explain(paper_id, "explainable AI", "anchors")
        self.assertEqual(ebm["method"], "ebm")
        self.assertEqual(shap_alias["method"], "ebm")
        self.assertEqual(anchors["method"], "anchors")

    def test_normalize_scholar_result_handles_sparse_payload(self) -> None:
        paper = normalize_scholar_result({"title": "Sparse paper", "snippet": "A tiny abstract."}, ["ComputerScience"])
        self.assertEqual(paper["title"], "Sparse paper")
        self.assertEqual(paper["categories"], ["ComputerScience"])
        self.assertTrue(paper["paper_id"].startswith("paper-"))

    def test_normalize_scholar_result_cleans_live_serpapi_metadata(self) -> None:
        paper = normalize_scholar_result(
            {
                "title": "Explainable AI",
                "snippet": "\u00e2\u0080\u00a6 Explainable AI (XAI) has developed \u00e2\u0080\u00a6",
                "publication_info": {
                    "summary": "W Samek, KR M\u00c3\u00bcller\u00e2\u0080\u00a6 - 2019 - books.google.com",
                    "authors": [{"name": "KR M\u00c3\u00bcller"}],
                },
                "link": "https://books.google.com/books?id=123",
                "source": "serpapi",
            }
        )

        self.assertEqual(paper["authors"], ["KR Müller"])
        self.assertEqual(paper["abstract"], "… Explainable AI (XAI) has developed …")
        self.assertEqual(paper["venue"], "")
        self.assertEqual(paper["categories"], [])

    def test_normalize_scholar_result_extracts_clean_venue_from_summary(self) -> None:
        paper = normalize_scholar_result(
            {
                "title": "What does explainable AI really mean?",
                "publication_info": {
                    "summary": "D Doran, S Schulz - arXiv preprint arXiv:1710.00794, 2017 - arxiv.org",
                },
                "source": "serpapi",
            }
        )

        self.assertEqual(paper["venue"], "arXiv preprint arXiv:1710.00794")


class SerpApiIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        runtime_root = (Path.cwd() / 'backend' / 'data' / 'test-runtime').resolve()
        runtime_root.mkdir(parents=True, exist_ok=True)
        self.db_path = runtime_root / 'serpapi-test.db'
        self.cache_path = runtime_root / 'serpapi-cache.json'
        if self.db_path.exists():
            self.db_path.unlink()
        if self.cache_path.exists():
            self.cache_path.unlink()
        self.db = Database(self.db_path)

    def tearDown(self) -> None:
        if self.db_path.exists():
            self.db_path.unlink()
        if self.cache_path.exists():
            self.cache_path.unlink()

    def test_fetch_scholar_results_builds_serpapi_google_scholar_query(self) -> None:
        class FakeResponse:
            def __init__(self, payload: dict[str, object]) -> None:
                self.payload = payload

            def read(self) -> bytes:
                return json.dumps(self.payload).encode('utf-8')

            def __enter__(self) -> 'FakeResponse':
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

        requested_urls: list[str] = []

        def fake_urlopen(url: str, timeout: int = 20) -> FakeResponse:
            requested_urls.append(url)
            return FakeResponse({"organic_results": []})

        with patch.object(corpus_module, 'SERPAPI_API_KEY', 'test-key'), patch.object(corpus_module, 'RAW_CORPUS_CACHE_PATH', self.cache_path), patch.object(corpus_module, 'urlopen', side_effect=fake_urlopen):
            fetch_scholar_results(
                'explainable ai',
                ['ComputerScience'],
                num=25,
                start=20,
                filters={'year_min': 2020, 'year_max': 2024},
                sort_by='recency',
            )

        self.assertEqual(len(requested_urls), 1)
        parsed = urlparse(requested_urls[0])
        params = parse_qs(parsed.query)
        self.assertEqual(params['engine'], ['google_scholar'])
        self.assertEqual(params['q'], ['explainable ai'])
        self.assertEqual(params['num'], ['20'])
        self.assertEqual(params['start'], ['20'])
        self.assertEqual(params['as_ylo'], ['2020'])
        self.assertEqual(params['as_yhi'], ['2024'])
        self.assertEqual(params['scisbd'], ['2'])
        self.assertEqual(params['api_key'], ['test-key'])

    def test_ingest_query_results_paginates_live_results(self) -> None:
        first_page = {
            'organic_results': [
                {'title': 'Paper A', 'link': 'https://example.edu/a', 'snippet': 'First paper', 'source': 'serpapi'},
                {'title': 'Paper B', 'link': 'https://example.edu/b', 'snippet': 'Second paper', 'source': 'serpapi'},
            ]
        }
        second_page = {
            'organic_results': [
                {'title': 'Paper C', 'link': 'https://example.edu/c', 'snippet': 'Third paper', 'source': 'serpapi'},
            ]
        }

        with patch.object(corpus_module, 'SERPAPI_API_KEY', 'test-key'), patch.object(corpus_module, 'SERPAPI_PAGE_SIZE', 2), patch.object(corpus_module, 'fetch_scholar_results', side_effect=[first_page, second_page]) as mocked_fetch:
            ingested = ingest_query_results(self.db, 'transformers', num=3, filters={'year_min': 2020}, sort_by='relevance')

        self.assertEqual(len(ingested), 3)
        self.assertEqual(mocked_fetch.call_count, 2)
        self.assertEqual(mocked_fetch.call_args_list[0].kwargs['start'], 0)
        self.assertEqual(mocked_fetch.call_args_list[1].kwargs['start'], 2)

    def test_search_endpoint_refreshes_corpus_before_ranking(self) -> None:
        fake_search_results = {
            'results': [],
            'processing_time': 0.0,
            'model_used': 'specter',
            'embedding_backend': 'hashing-fallback',
            'index_backend': 'faiss',
            'reranker_backend': 'native-ebm-style',
        }

        with patch.object(main_module, 'ingest_query_results', return_value=[{'paper_id': 'live-paper'}]) as mocked_ingest, patch.object(main_module.search_service, 'search', return_value=fake_search_results.copy()) as mocked_search, patch.object(main_module, 'has_live_serpapi', return_value=True):
            response = main_module.search_papers(
                {
                    'query': 'federated learning',
                    'top_k': 12,
                    'filters': {'year_min': 2021},
                    'sort_by': 'recency',
                },
                authorization=None,
            )

        mocked_ingest.assert_called_once()
        mocked_search.assert_called_once()
        self.assertEqual(mocked_ingest.call_args.kwargs['num'], 20)
        self.assertEqual(response['live_refresh_count'], 1)
        self.assertTrue(response['live_source_enabled'])
        self.assertEqual(response['live_source'], 'serpapi/google_scholar')


if __name__ == "__main__":
    unittest.main()


