from __future__ import annotations

import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "insightscholar.db"
VECTOR_INDEX_PATH = DATA_DIR / "vector_index.json"
SAMPLE_CORPUS_PATH = DATA_DIR / "sample_corpus.json"
RAW_CORPUS_CACHE_PATH = DATA_DIR / "scholar_cache.json"

SECRET_KEY = os.getenv("INSIGHTSCHOLAR_SECRET_KEY", "insightscholar-dev-secret")
TOKEN_TTL_SECONDS = int(os.getenv("INSIGHTSCHOLAR_TOKEN_TTL_SECONDS", str(7 * 24 * 60 * 60)))


def _read_config_file_key(key: str) -> str:
    """Read a key from run_insightscholar.config as fallback for missing env vars."""
    config_path = BACKEND_DIR.parent / "run_insightscholar.config"
    try:
        for line in config_path.read_text(encoding="utf-8").splitlines():
            if "=" in line:
                k, _, v = line.partition("=")
                if k.strip() == key:
                    return v.strip()
    except OSError:
        pass
    return ""


SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY", "").strip() or _read_config_file_key("SERPAPI_API_KEY")
SERPAPI_BASE_URL = os.getenv("SERPAPI_BASE_URL", "https://serpapi.com/search.json").strip()
EMBEDDING_MODEL_NAME = os.getenv("INSIGHTSCHOLAR_EMBEDDING_MODEL", "allenai/specter2_base")
DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("INSIGHTSCHOLAR_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
    if origin.strip()
]
ENABLE_REMOTE_MODEL_LOAD = os.getenv("INSIGHTSCHOLAR_ENABLE_MODEL_DOWNLOAD", "").strip().lower() in {"1", "true", "yes"}
