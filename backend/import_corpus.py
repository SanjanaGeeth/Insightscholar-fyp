"""Import S2ORC parquet corpus into the FYP Clause - Copy SQLite database.

Usage (from FYP Clause - Copy/backend/):
    python import_corpus.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import pandas as pd
from datetime import datetime, timezone

from app.database import Database
from app.config import DB_PATH

PARQUET_PATH = os.path.join(
    os.path.dirname(__file__),
    "..", "..", "backend", "data", "processed", "papers_processed_subject_year.parquet",
)
BATCH_SIZE = 1000


def run() -> None:
    db = Database(DB_PATH)
    print(f"Loading parquet from:\n  {os.path.abspath(PARQUET_PATH)}")
    df = pd.read_parquet(
        PARQUET_PATH,
        columns=["paper_id", "title", "abstract", "year", "tags", "subject"],
    )
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    total = len(df)
    print(f"Importing {total} papers into {DB_PATH} ...")
    for i, row in enumerate(df.itertuples(index=False), 1):
        tags = list(row.tags) if row.tags is not None else []
        paper = {
            "paper_id": str(row.paper_id),
            "title": str(row.title or ""),
            "authors": [],
            "year": int(row.year) if row.year else None,
            "venue": str(row.subject or ""),
            "categories": tags,
            "abstract": str(row.abstract or ""),
            "url": f"https://api.semanticscholar.org/CorpusID:{row.paper_id}",
            "citations": 0,
            "influential_citations": 0,
            "source": "s2orc",
            "raw_payload": {},
            "indexed_at": now,
        }
        db.upsert_paper(paper)
        if i % BATCH_SIZE == 0:
            print(f"  {i}/{total}")
    print(f"\nDone. {total} papers imported.")
    print("Restart the backend to rebuild the vector index.")


if __name__ == "__main__":
    run()
