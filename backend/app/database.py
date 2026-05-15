from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any


GUEST_USERNAME = "__guest__"
GUEST_EMAIL = "__guest__@insightscholar.local"
GUEST_PASSWORD_HASH = "auth-disabled"
GUEST_CREATED_AT = "1970-01-01T00:00:00Z"


class Database:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with closing(self._connect()) as connection, connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    full_name TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS papers (
                    paper_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    authors_json TEXT NOT NULL,
                    year INTEGER,
                    venue TEXT,
                    categories_json TEXT NOT NULL,
                    abstract TEXT NOT NULL,
                    url TEXT,
                    citations INTEGER NOT NULL DEFAULT 0,
                    influential_citations INTEGER NOT NULL DEFAULT 0,
                    source TEXT NOT NULL,
                    raw_payload_json TEXT,
                    indexed_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS bookmarks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    paper_id TEXT NOT NULL,
                    query TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    UNIQUE(user_id, paper_id),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS search_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    query TEXT NOT NULL,
                    result_count INTEGER NOT NULL,
                    model_used TEXT NOT NULL,
                    ranking_method TEXT NOT NULL,
                    filters_json TEXT NOT NULL,
                    searched_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO users (username, email, password_hash, full_name, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (GUEST_USERNAME, GUEST_EMAIL, GUEST_PASSWORD_HASH, 'Guest', GUEST_CREATED_AT),
            )

    @staticmethod
    def _row_to_paper(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {
            'paper_id': row['paper_id'],
            'title': row['title'],
            'authors': json.loads(row['authors_json']),
            'year': row['year'],
            'venue': row['venue'],
            'categories': json.loads(row['categories_json']),
            'abstract': row['abstract'],
            'url': row['url'],
            'citations': row['citations'],
            'influential_citations': row['influential_citations'],
            'source': row['source'],
            'indexed_at': row['indexed_at'],
            'raw_payload': json.loads(row['raw_payload_json']) if row['raw_payload_json'] else {},
        }

    def create_user(self, username: str, email: str, password_hash: str, full_name: str | None, created_at: str) -> dict[str, Any]:
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                """
                INSERT INTO users (username, email, password_hash, full_name, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, email, password_hash, full_name, created_at),
            )
            user_id = cursor.lastrowid
        return self.get_user_by_id(int(user_id))

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                'SELECT id, username, email, full_name, created_at, password_hash FROM users WHERE id = ?',
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return dict(row)

    def get_user_by_identifier(self, identifier: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT id, username, email, full_name, created_at, password_hash
                FROM users
                WHERE lower(username) = lower(?) OR lower(email) = lower(?)
                """,
                (identifier, identifier),
            ).fetchone()
        return dict(row) if row else None

    def get_guest_user(self) -> dict[str, Any]:
        user = self.get_user_by_identifier(GUEST_USERNAME)
        if user is None:
            self._initialize()
            user = self.get_user_by_identifier(GUEST_USERNAME)
        if user is None:
            raise RuntimeError('Guest user could not be initialized')
        return user

    def count_users(self) -> int:
        with closing(self._connect()) as connection:
            row = connection.execute(
                'SELECT COUNT(*) AS total FROM users WHERE username <> ?',
                (GUEST_USERNAME,),
            ).fetchone()
        return int(row['total'])

    def upsert_paper(self, paper: dict[str, Any]) -> None:
        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT INTO papers (
                    paper_id, title, authors_json, year, venue, categories_json, abstract, url,
                    citations, influential_citations, source, raw_payload_json, indexed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(paper_id) DO UPDATE SET
                    title = excluded.title,
                    authors_json = excluded.authors_json,
                    year = excluded.year,
                    venue = excluded.venue,
                    categories_json = excluded.categories_json,
                    abstract = excluded.abstract,
                    url = excluded.url,
                    citations = excluded.citations,
                    influential_citations = excluded.influential_citations,
                    source = excluded.source,
                    raw_payload_json = excluded.raw_payload_json,
                    indexed_at = excluded.indexed_at
                """,
                (
                    paper['paper_id'],
                    paper['title'],
                    json.dumps(paper.get('authors', [])),
                    paper.get('year'),
                    paper.get('venue'),
                    json.dumps(paper.get('categories', [])),
                    paper.get('abstract', ''),
                    paper.get('url'),
                    int(paper.get('citations', 0) or 0),
                    int(paper.get('influential_citations', 0) or 0),
                    paper.get('source', 'seed'),
                    json.dumps(paper.get('raw_payload', {})),
                    paper['indexed_at'],
                ),
            )

    def get_paper(self, paper_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute('SELECT * FROM papers WHERE paper_id = ?', (paper_id,)).fetchone()
        return self._row_to_paper(row)

    def list_papers(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            rows = connection.execute('SELECT * FROM papers ORDER BY year DESC, citations DESC, title ASC').fetchall()
        return [self._row_to_paper(row) for row in rows if row is not None]

    def count_papers(self) -> int:
        with closing(self._connect()) as connection:
            row = connection.execute('SELECT COUNT(*) AS total FROM papers').fetchone()
        return int(row['total'])

    def remove_papers(self, paper_ids: list[str]) -> int:
        if not paper_ids:
            return 0
        placeholders = ','.join('?' for _ in paper_ids)
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                f'DELETE FROM papers WHERE paper_id IN ({placeholders})',
                tuple(paper_ids),
            )
        return cursor.rowcount

    def add_bookmark(self, user_id: int, paper_id: str, query: str, notes: str, created_at: str) -> dict[str, Any]:
        with closing(self._connect()) as connection, connection:
            connection.execute(
                """
                INSERT INTO bookmarks (user_id, paper_id, query, notes, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, paper_id) DO UPDATE SET
                    query = excluded.query,
                    notes = excluded.notes,
                    created_at = excluded.created_at
                """,
                (user_id, paper_id, query, notes, created_at),
            )
            row = connection.execute(
                'SELECT id, paper_id, query, notes, created_at FROM bookmarks WHERE user_id = ? AND paper_id = ?',
                (user_id, paper_id),
            ).fetchone()
        return dict(row)

    def list_bookmarks(self, user_id: int) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT id, paper_id, query, notes, created_at
                FROM bookmarks
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def remove_bookmark(self, user_id: int, paper_id: str) -> bool:
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                'DELETE FROM bookmarks WHERE user_id = ? AND paper_id = ?',
                (user_id, paper_id),
            )
        return cursor.rowcount > 0

    def count_bookmarks(self) -> int:
        with closing(self._connect()) as connection:
            row = connection.execute('SELECT COUNT(*) AS total FROM bookmarks').fetchone()
        return int(row['total'])

    def add_search_history(
        self,
        user_id: int,
        query: str,
        result_count: int,
        model_used: str,
        ranking_method: str,
        filters: dict[str, Any],
        searched_at: str,
    ) -> dict[str, Any]:
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                """
                INSERT INTO search_history (
                    user_id, query, result_count, model_used, ranking_method, filters_json, searched_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    query,
                    result_count,
                    model_used,
                    ranking_method,
                    json.dumps(filters),
                    searched_at,
                ),
            )
            row = connection.execute(
                """
                SELECT id, query, result_count, model_used, ranking_method, filters_json, searched_at
                FROM search_history
                WHERE id = ?
                """,
                (cursor.lastrowid,),
            ).fetchone()
        data = dict(row)
        data['filters'] = json.loads(data.pop('filters_json'))
        return data

    def list_search_history(self, user_id: int, limit: int) -> list[dict[str, Any]]:
        with closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT id, query, result_count, model_used, ranking_method, filters_json, searched_at
                FROM search_history
                WHERE user_id = ?
                ORDER BY searched_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        history: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item['filters'] = json.loads(item.pop('filters_json'))
            history.append(item)
        return history

    def delete_search_history_entry(self, user_id: int, entry_id: int) -> bool:
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute(
                'DELETE FROM search_history WHERE id = ? AND user_id = ?',
                (entry_id, user_id),
            )
        return cursor.rowcount > 0

    def clear_search_history(self, user_id: int) -> int:
        with closing(self._connect()) as connection, connection:
            cursor = connection.execute('DELETE FROM search_history WHERE user_id = ?', (user_id,))
        return cursor.rowcount
