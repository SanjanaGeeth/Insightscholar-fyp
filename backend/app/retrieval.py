from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import re
from pathlib import Path
from typing import Any

from .config import EMBEDDING_MODEL_NAME, ENABLE_REMOTE_MODEL_LOAD, VECTOR_INDEX_PATH
from .database import Database


TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
SENTENCE_BOUNDARY_PATTERN = re.compile(r"(?<=[.!?])\s+")
STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "is",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "with",
}


def tokenize(text: str) -> list[str]:
    return [token for token in TOKEN_PATTERN.findall(text.lower()) if token not in STOPWORDS and len(token) > 1]


def dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


def cosine_similarity(left: list[float], right: list[float]) -> float:
    numerator = sum(left_value * right_value for left_value, right_value in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return max(0.0, min(1.0, numerator / (left_norm * right_norm)))


class SpecterCompatibleEncoder:
    def __init__(self, dimensions: int = 96):
        self.dimensions = dimensions
        self.model_name = EMBEDDING_MODEL_NAME
        self.backend = "hashing-fallback"
        self._model = None
        model_path = Path(self.model_name)
        if importlib.util.find_spec("sentence_transformers") is not None and (ENABLE_REMOTE_MODEL_LOAD or model_path.exists()):
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(self.model_name)
                self.backend = self.model_name
            except Exception:
                self._model = None

    def encode(self, text: str) -> list[float]:
        if self._model is not None:
            embedding = self._model.encode(text, normalize_embeddings=True)
            return [float(value) for value in embedding]
        vector = [0.0] * self.dimensions
        tokens = tokenize(text)
        if not tokens:
            return vector
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            for offset in range(0, 16, 4):
                chunk = digest[offset : offset + 4]
                index = int.from_bytes(chunk[:2], "big") % self.dimensions
                sign = 1.0 if chunk[2] % 2 == 0 else -1.0
                magnitude = 1.0 + (chunk[3] / 255.0)
                vector[index] += sign * magnitude
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector
        return [value / norm for value in vector]


class DiskBackedVectorIndex:
    def __init__(self, index_path: str | Path = VECTOR_INDEX_PATH):
        self.index_path = Path(index_path)
        self.encoder = SpecterCompatibleEncoder()
        self.backend = "faiss" if importlib.util.find_spec("faiss") is not None else "python-cosine"
        self._cache: dict[str, Any] | None = None
        self._faiss_index: Any = None
        self._faiss_ids: list[str] = []

    @staticmethod
    def _fingerprint(papers: list[dict[str, Any]]) -> str:
        if not papers:
            return "empty"
        max_ts = max(p.get("indexed_at", "") for p in papers)
        return f"{len(papers)}::{max_ts}"

    def _load(self) -> dict[str, Any] | None:
        if self._cache is not None:
            return self._cache
        if not self.index_path.exists():
            return None
        self._cache = json.loads(self.index_path.read_text(encoding="utf-8"))
        return self._cache

    def _build_faiss(self, vectors: dict[str, list[float]]) -> None:
        if importlib.util.find_spec("faiss") is None or not vectors:
            return
        import faiss  # type: ignore[import]
        import numpy as np  # type: ignore[import]
        self._faiss_ids = list(vectors.keys())
        matrix = np.array([vectors[pid] for pid in self._faiss_ids], dtype=np.float32)
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        matrix /= norms
        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)
        self._faiss_index = index

    def warm_up(self) -> None:
        """Load vector index from disk and build FAISS index. Called once at startup."""
        cached = self._load()
        if cached and self._faiss_index is None:
            self._build_faiss(cached.get("vectors", {}))

    def ensure(self, papers: list[dict[str, Any]]) -> dict[str, Any]:
        expected_fingerprint = self._fingerprint(papers)
        cached = self._load()
        if cached and cached.get("fingerprint") == expected_fingerprint:
            if self._faiss_index is None:
                self._build_faiss(cached.get("vectors", {}))
            return cached
        vectors = {}
        for paper in papers:
            text = " ".join(
                [
                    paper.get("title", ""),
                    " ".join(paper.get("authors", [])),
                    paper.get("abstract", ""),
                    " ".join(paper.get("categories", [])),
                ]
            )
            vectors[paper["paper_id"]] = self.encoder.encode(text)
        payload = {
            "fingerprint": expected_fingerprint,
            "embedding_backend": self.encoder.backend,
            "index_backend": self.backend,
            "vectors": vectors,
        }
        self.index_path.write_text(json.dumps(payload), encoding="utf-8")
        self._cache = payload
        self._build_faiss(payload["vectors"])
        return payload

    def add_papers(self, papers: list[dict[str, Any]]) -> None:
        """Incrementally encode and add new papers to the in-memory FAISS index."""
        if not papers or self._cache is None:
            return
        existing_ids = set(self._cache.get("vectors", {}).keys())
        new_papers = [p for p in papers if p["paper_id"] not in existing_ids]
        if not new_papers:
            return
        for paper in new_papers:
            text = " ".join([
                paper.get("title", ""),
                " ".join(paper.get("authors", [])),
                paper.get("abstract", ""),
                " ".join(paper.get("categories", [])),
            ])
            vec = self.encoder.encode(text)
            self._cache["vectors"][paper["paper_id"]] = vec
            if self._faiss_index is not None and importlib.util.find_spec("faiss"):
                import faiss  # type: ignore[import]
                import numpy as np  # type: ignore[import]
                q = np.array([vec], dtype=np.float32)
                faiss.normalize_L2(q)
                self._faiss_index.add(q)
                self._faiss_ids.append(paper["paper_id"])

    def search(self, query: str, papers: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
        if self._faiss_index is not None and self._faiss_ids:
            import faiss  # type: ignore[import]
            import numpy as np  # type: ignore[import]
            paper_by_id = {p["paper_id"]: p for p in papers}
            query_vector = self.encoder.encode(query)
            q = np.array([query_vector], dtype=np.float32)
            faiss.normalize_L2(q)
            k = min(max(top_k * 10, 100), self._faiss_index.ntotal)
            distances, indices = self._faiss_index.search(q, k)
            scored = []
            for dist, idx in zip(distances[0], indices[0]):
                if idx < 0 or idx >= len(self._faiss_ids):
                    continue
                paper = paper_by_id.get(self._faiss_ids[idx])
                if paper is None:
                    continue
                scored.append({"paper": paper, "semantic_similarity": float(max(0.0, float(dist)))})
            return scored
        # Python cosine fallback
        payload = self.ensure(papers)
        query_vector = self.encoder.encode(query)
        scored = []
        for paper in papers:
            paper_vector = payload["vectors"].get(paper["paper_id"])
            if not paper_vector:
                continue
            scored.append({"paper": paper, "semantic_similarity": cosine_similarity(query_vector, paper_vector)})
        scored.sort(key=lambda item: item["semantic_similarity"], reverse=True)
        return scored[: max(top_k, 1)]


class ExplainableBoostingReranker:
    def __init__(self) -> None:
        self.weights = {
            "semantic_similarity": 0.55,
            "abstract_overlap": 0.18,
            "title_overlap": 0.12,
            "citation_signal": 0.07,
            "influential_signal": 0.04,
            "recency_signal": 0.03,
            "field_match": 0.01,
        }
        self.backend = "native-ebm-style"

    @staticmethod
    def _overlap_ratio(query_tokens: list[str], haystack_tokens: list[str]) -> float:
        if not query_tokens:
            return 0.0
        return len(set(query_tokens).intersection(haystack_tokens)) / len(set(query_tokens))

    @staticmethod
    def _scaled_log_score(value: int, ceiling: int) -> float:
        bounded = max(0, min(value, ceiling))
        return math.log1p(bounded) / math.log1p(ceiling)

    def featurize(
        self,
        query: str,
        paper: dict[str, Any],
        semantic_similarity: float,
        fields_of_study: list[str] | None = None,
    ) -> dict[str, float]:
        query_tokens = tokenize(query)
        title_tokens = tokenize(paper.get("title", ""))
        abstract_tokens = tokenize(paper.get("abstract", ""))
        categories = [category.lower() for category in paper.get("categories", [])]
        selected_fields = [field.lower() for field in (fields_of_study or [])]
        year = int(paper.get("year") or 0)
        current_year = 2026
        recency_signal = 0.0 if year <= 0 else max(0.0, min(1.0, (year - 1995) / (current_year - 1995)))
        field_match = 1.0 if not selected_fields else float(bool(set(selected_fields).intersection(categories)))
        return {
            "semantic_similarity": max(0.0, min(1.0, semantic_similarity)),
            "title_overlap": self._overlap_ratio(query_tokens, title_tokens),
            "abstract_overlap": self._overlap_ratio(query_tokens, abstract_tokens),
            "citation_signal": self._scaled_log_score(int(paper.get("citations", 0) or 0), 5000),
            "influential_signal": self._scaled_log_score(int(paper.get("influential_citations", 0) or 0), 2000),
            "recency_signal": recency_signal,
            "field_match": field_match,
        }

    def explain_terms(self, features: dict[str, float], ranking_method: str) -> tuple[float, dict[str, float]]:
        if ranking_method == "semantic":
            contributions = {feature: (value if feature == "semantic_similarity" else 0.0) for feature, value in features.items()}
            return contributions["semantic_similarity"], contributions
        contributions = {
            feature: round(features[feature] * weight, 4)
            for feature, weight in self.weights.items()
        }
        score = sum(contributions.values()) / sum(self.weights.values())
        return round(score, 4), contributions


class SearchService:
    def __init__(self, db: Database, index_path: str | Path = VECTOR_INDEX_PATH):
        self.db = db
        self.index = DiskBackedVectorIndex(index_path)
        self.reranker = ExplainableBoostingReranker()
        self._papers_cache: list[dict[str, Any]] | None = None

    def warm_up(self) -> None:
        """Load papers and FAISS index at startup without triggering a full rebuild."""
        self._papers_cache = self.db.list_papers()
        # Load existing vector_index.json and build FAISS — do NOT call ensure()
        # which would rebuild all 100K vectors whenever the fingerprint changes.
        self.index.warm_up()
        # Incrementally encode any papers added since the last index save.
        indexed_ids = set(self.index._faiss_ids)
        missing = [p for p in self._papers_cache if p["paper_id"] not in indexed_ids]
        if missing:
            self.index.add_papers(missing)

    def _get_papers(self) -> list[dict[str, Any]]:
        if self._papers_cache is None:
            self._papers_cache = self.db.list_papers()
            self.index.warm_up()
        return self._papers_cache

    def update_with_new_papers(self, new_papers: list[dict[str, Any]]) -> None:
        """Incrementally add SerpAPI-ingested papers without reloading from DB."""
        if not new_papers:
            return
        papers = self._get_papers()
        existing_ids = {p["paper_id"] for p in papers}
        truly_new = [p for p in new_papers if p["paper_id"] not in existing_ids]
        if truly_new:
            papers.extend(truly_new)
            self.index.add_papers(truly_new)

    @staticmethod
    def _matches_filters(paper: dict[str, Any], filters: dict[str, Any], fields_of_study: list[str] | None = None) -> bool:
        year_min = filters.get("year_min")
        year_max = filters.get("year_max")
        paper_year = paper.get("year")
        if year_min and (paper_year is None or paper_year < int(year_min)):
            return False
        if year_max and (paper_year is None or paper_year > int(year_max)):
            return False
        if fields_of_study:
            normalized_fields = set(field.lower() for field in fields_of_study)
            normalized_categories = set(category.lower() for category in paper.get("categories", []))
            if normalized_fields and not normalized_fields.intersection(normalized_categories):
                return False
        return True

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        normalized = re.sub(r"\s+", " ", text.strip())
        if not normalized:
            return []
        return [segment.strip() for segment in SENTENCE_BOUNDARY_PATTERN.split(normalized) if segment.strip()]

    @staticmethod
    def _clip_text(text: str, limit: int = 180) -> str:
        normalized = re.sub(r"\s+", " ", text.strip())
        if len(normalized) <= limit:
            return normalized
        clipped = normalized[: max(limit - 3, 0)].rsplit(" ", 1)[0].strip()
        return f"{clipped or normalized[: max(limit - 3, 0)]}..."

    @staticmethod
    def _feature_label(feature: str) -> str:
        return feature.replace("_", " ")

    @staticmethod
    def _format_terms(terms: list[str]) -> str:
        normalized = [term.replace("_", " ") for term in dedupe_preserve_order(terms) if term]
        if not normalized:
            return ""
        if len(normalized) == 1:
            return normalized[0]
        if len(normalized) == 2:
            return f"{normalized[0]} and {normalized[1]}"
        return f"{', '.join(normalized[:-1])}, and {normalized[-1]}"

    @staticmethod
    def _extract_keywords(query: str, paper: dict[str, Any]) -> list[str]:
        query_tokens = tokenize(query)
        paper_tokens = set(tokenize(f"{paper.get('title', '')} {paper.get('abstract', '')}"))
        return dedupe_preserve_order([token for token in query_tokens if token in paper_tokens])[:6]

    def _extract_evidence(self, query: str, paper: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
        query_tokens = tokenize(query)
        title = str(paper.get("title", "") or "").strip()
        abstract = str(paper.get("abstract", "") or "").strip()
        title_tokens = set(tokenize(title))

        evidence_spans: list[dict[str, Any]] = []
        matched_terms: list[str] = []

        title_matches = dedupe_preserve_order([token for token in query_tokens if token in title_tokens])
        if title and title_matches:
            evidence_spans.append(
                {
                    "source": "title",
                    "label": "Title evidence",
                    "text": title,
                    "matched_terms": title_matches[:4],
                }
            )
            matched_terms.extend(title_matches)

        sentence_candidates: list[tuple[int, str, list[str]]] = []
        for sentence in self._split_sentences(abstract):
            sentence_tokens = set(tokenize(sentence))
            sentence_matches = dedupe_preserve_order([token for token in query_tokens if token in sentence_tokens])
            if sentence_matches:
                sentence_candidates.append((len(sentence_matches), sentence, sentence_matches))

        sentence_candidates.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
        used_snippets: set[str] = set()
        abstract_evidence_count = 0
        for _, sentence, sentence_matches in sentence_candidates:
            snippet = self._clip_text(sentence)
            if snippet in used_snippets:
                continue
            evidence_spans.append(
                {
                    "source": "abstract",
                    "label": "Abstract evidence",
                    "text": snippet,
                    "matched_terms": sentence_matches[:4],
                }
            )
            used_snippets.add(snippet)
            matched_terms.extend(sentence_matches)
            abstract_evidence_count += 1
            if abstract_evidence_count >= 2:
                break

        if not evidence_spans:
            if title:
                evidence_spans.append(
                    {
                        "source": "title",
                        "label": "Title context",
                        "text": title,
                        "matched_terms": [],
                    }
                )
            if abstract:
                sentences = self._split_sentences(abstract)
                snippet_source = sentences[0] if sentences else abstract
                evidence_spans.append(
                    {
                        "source": "abstract",
                        "label": "Abstract context",
                        "text": self._clip_text(snippet_source),
                        "matched_terms": [],
                    }
                )

        return evidence_spans[:3], dedupe_preserve_order(matched_terms)[:6]

    def _compose_grounded_summary(
        self,
        query: str,
        evidence_spans: list[dict[str, Any]],
        strongest_features: list[str] | None = None,
    ) -> str:
        strongest_features = strongest_features or []
        title_evidence = next(
            (item for item in evidence_spans if item.get("source") == "title" and item.get("matched_terms")),
            None,
        )
        abstract_match = next(
            (item for item in evidence_spans if item.get("source") == "abstract" and item.get("matched_terms")),
            None,
        )
        abstract_context = next((item for item in evidence_spans if item.get("source") == "abstract"), None)

        summary_parts: list[str] = []
        if title_evidence and title_evidence.get("matched_terms"):
            summary_parts.append(f"the title mentions {self._format_terms(title_evidence['matched_terms'])}")
        if abstract_match:
            summary_parts.append(f'the abstract says "{abstract_match["text"]}"')
        elif abstract_context:
            summary_parts.append(f'the abstract discusses related ideas such as "{abstract_context["text"]}"')
        elif evidence_spans:
            summary_parts.append(f'the paper discusses this in "{evidence_spans[0]["text"]}"')
        if not summary_parts:
            summary_parts.append(f'it is semantically related to "{query}"')

        summary = "Suggested because " + " and ".join(summary_parts[:2]) + "."
        if strongest_features:
            summary += (
                " The strongest ranking factors were "
                f"{self._format_terms([self._feature_label(feature) for feature in strongest_features])}."
            )
        return summary

    def _keywords_explanation(self, query: str, paper: dict[str, Any], features: dict[str, float], score: float) -> dict[str, Any]:
        evidence_spans, keywords = self._extract_evidence(query, paper)
        feature_importance = {
            "semantic_similarity": round(features["semantic_similarity"], 4),
            "title_overlap": round(features["title_overlap"], 4),
            "abstract_overlap": round(features["abstract_overlap"], 4),
        }
        return {
            "method": "keywords",
            "explanation_text": self._compose_grounded_summary(query, evidence_spans),
            "feature_importance": feature_importance,
            "top_keywords": keywords,
            "evidence_spans": evidence_spans,
            "similarity_score": round(score, 4),
        }

    def _ebm_explanation(
        self,
        query: str,
        paper: dict[str, Any],
        features: dict[str, float],
        contributions: dict[str, float],
        score: float,
    ) -> dict[str, Any]:
        sorted_terms = sorted(contributions.items(), key=lambda item: abs(item[1]), reverse=True)
        strongest_terms = [feature for feature, value in sorted_terms if value > 0][:3]
        evidence_spans, keywords = self._extract_evidence(query, paper)
        return {
            "method": "ebm",
            "model_family": self.reranker.backend,
            "explanation_text": self._compose_grounded_summary(query, evidence_spans, strongest_terms),
            "feature_importance": contributions,
            "term_contributions": [
                {"feature": feature, "contribution": value, "value": features[feature]}
                for feature, value in sorted_terms
            ],
            "feature_highlights": [self._feature_label(feature) for feature in strongest_terms],
            "top_keywords": keywords,
            "evidence_spans": evidence_spans,
            "similarity_score": round(score, 4),
            "base_value": 0.0,
        }

    def _anchor_explanation(
        self,
        query: str,
        paper: dict[str, Any],
        contributions: dict[str, float],
        score: float,
    ) -> dict[str, Any]:
        evidence_spans, matched_keywords = self._extract_evidence(query, paper)
        title_evidence = next(
            (item for item in evidence_spans if item.get("source") == "title" and item.get("matched_terms")),
            None,
        )
        abstract_evidence = next((item for item in evidence_spans if item.get("source") == "abstract"), None)

        rules: list[str] = []
        if title_evidence and title_evidence.get("matched_terms"):
            rules.append(f"title contains {self._format_terms(title_evidence['matched_terms'])}")
        if abstract_evidence:
            rules.append(f'abstract mentions "{abstract_evidence["text"]}"')
        if paper.get("year"):
            rules.append(f"published in {paper['year']}")
        if paper.get("citations", 0) > 100:
            rules.append(f"citation count is {paper['citations']}")
        if not rules:
            rules.append("paper content stays semantically close to the query topic")

        coverage = min(0.95, 0.45 + 0.08 * len(rules))
        precision = min(0.98, 0.62 + max(0.0, score) * 0.35)
        return {
            "method": "anchors",
            "explanation_text": self._compose_grounded_summary(query, evidence_spans),
            "feature_importance": contributions,
            "anchor_rules": rules[:4],
            "anchor_precision": round(precision, 4),
            "anchor_coverage": round(coverage, 4),
            "top_keywords": matched_keywords,
            "evidence_spans": evidence_spans,
            "similarity_score": round(score, 4),
        }

    def search(
        self,
        query: str,
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
        model: str = "specter",
        ranking_method: str = "hybrid",
        sort_by: str = "relevance",
        fields_of_study: list[str] | None = None,
    ) -> dict[str, Any]:
        filters = filters or {}
        candidate_papers = [paper for paper in self._get_papers() if self._matches_filters(paper, filters, fields_of_study)]
        if not candidate_papers:
            return {
                "results": [],
                "processing_time": 0.0,
                "model_used": model,
                "embedding_backend": self.index.encoder.backend,
                "index_backend": self.index.backend,
                "reranker_backend": self.reranker.backend,
            }
        retrieved = self.index.search(query, candidate_papers, min(top_k * 10, len(candidate_papers)))
        ranked = []
        for item in retrieved:
            paper = item["paper"]
            features = self.reranker.featurize(query, paper, item["semantic_similarity"], fields_of_study)
            score, contributions = self.reranker.explain_terms(features, ranking_method)
            ranked.append(
                {
                    "paper": paper,
                    "score": round(score, 4),
                    "features": features,
                    "contributions": contributions,
                }
            )
        if sort_by == "citations":
            ranked.sort(key=lambda item: (item["paper"].get("citations", 0), item["score"]), reverse=True)
        elif sort_by == "influential":
            ranked.sort(key=lambda item: (item["paper"].get("influential_citations", 0), item["score"]), reverse=True)
        elif sort_by == "recency":
            ranked.sort(key=lambda item: (item["paper"].get("year") or 0, item["score"]), reverse=True)
        else:
            ranked.sort(key=lambda item: item["score"], reverse=True)
        query_token_count = max(1, len(tokenize(query)))
        # Require at least 10% of query tokens in the abstract, OR 15% in the title,
        # OR strong semantic similarity — prevents single-word coincidences from passing.
        min_abstract = max(0.10, 1.0 / query_token_count)
        ranked = [
            item for item in ranked
            if item["features"]["abstract_overlap"] >= min_abstract
            or item["features"]["title_overlap"] >= 0.15
            or item["features"]["semantic_similarity"] >= 0.70
        ]
        results = []
        for index, item in enumerate(ranked[:top_k], start=1):
            results.append(
                {
                    "paper": item["paper"],
                    "score": item["score"],
                    "rank": index,
                    "explanation": self._keywords_explanation(query, item["paper"], item["features"], item["score"]),
                }
            )
        return {
            "results": results,
            "processing_time": 0.0,
            "model_used": model,
            "embedding_backend": self.index.encoder.backend,
            "index_backend": self.index.backend,
            "reranker_backend": self.reranker.backend,
        }

    def explain(self, paper_id: str, query: str, method: str = "keywords") -> dict[str, Any]:
        paper = self.db.get_paper(paper_id)
        if paper is None:
            raise KeyError(paper_id)
        semantic_similarity = 0.0
        for item in self.index.search(query, [paper], top_k=1):
            semantic_similarity = item["semantic_similarity"]
        features = self.reranker.featurize(query, paper, semantic_similarity)
        score, contributions = self.reranker.explain_terms(features, "hybrid")
        if method == "keywords":
            return self._keywords_explanation(query, paper, features, score)
        if method in {"ebm", "shap"}:
            explanation = self._ebm_explanation(query, paper, features, contributions, score)
            if method == "shap":
                explanation["requested_method"] = "shap"
            return explanation
        if method == "anchors":
            return self._anchor_explanation(query, paper, contributions, score)
        raise ValueError(method)