# InsightScholar

An **Explainable Research Paper Recommendation System** built as a Final Year Project. InsightScholar enables users to search academic papers using semantic similarity and provides transparent explanations for why each paper was recommended.

## Features

- **Semantic Search** — Vector-based paper retrieval using SPECTER2 embeddings (with a lightweight hashing fallback)
- **Explainability** — SHAP force plots, anchor explanations, and keyword-level relevance highlighting
- **Hybrid Ranking** — Combines semantic similarity with an Explainable Boosting Machine (EBM) reranker
- **Live Search** — Optional real-time Google Scholar results via SerpApi
- **Bookmarks & History** — Per-session paper saving and search history

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Tailwind CSS, Recharts |
| Backend | Python, FastAPI, uvicorn |
| Embeddings | sentence-transformers (`allenai/specter2_base`) |
| Vector Index | FAISS (with Python cosine fallback) |
| Reranker | scikit-learn, interpret (EBM) |
| Database | SQLite |
| Live Search | SerpApi (Google Scholar) |

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI routes
│   │   ├── retrieval.py   # Search, ranking, explainability
│   │   ├── database.py    # SQLite access layer
│   │   ├── corpus.py      # Corpus management & SerpApi integration
│   │   └── config.py      # Environment variable configuration
│   ├── data/              # SQLite DB & vector index (not in repo — large files)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/    # React UI components
│   │   └── services/api.js
│   └── package.json
└── run_insightscholar.bat  # Windows launcher (starts both services)
```

## Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend
```bash
pip install -r backend/requirements.txt
python -m uvicorn app.main:app --reload --app-dir backend
```

### Frontend
```bash
cd frontend
npm install
npm start
```

### Configuration
Copy `run_insightscholar.config.example` to `run_insightscholar.config` and fill in your SerpApi key:
```
SERPAPI_API_KEY=your_key_here
```

Or set as environment variable:
```bash
export SERPAPI_API_KEY=your_key_here
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERPAPI_API_KEY` | — | SerpApi key for live Google Scholar search |
| `INSIGHTSCHOLAR_ENABLE_MODEL_DOWNLOAD` | `false` | Enable SPECTER2 embedding model download |
| `INSIGHTSCHOLAR_ALLOWED_ORIGINS` | `localhost:3000` | Comma-separated CORS origins |
| `REACT_APP_API_URL` | `http://localhost:8000/api/v1` | Backend API URL for the frontend |

> **Note:** The large data files (`insightscholar.db`, `vector_index.json`) are not included in this repository. Run the backend once to regenerate the vector index from the seed corpus, or provide your own database.

## API Endpoints

All endpoints are under `/api/v1`:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/search` | Search papers |
| `GET` | `/paper/{id}` | Get paper details |
| `POST` | `/explain` | Get explanation for a result |
| `GET` | `/bookmarks` | List bookmarks |
| `POST` | `/bookmarks` | Add bookmark |
| `DELETE` | `/bookmarks/{id}` | Remove bookmark |
| `GET` | `/history` | Search history |
| `GET` | `/stats` | System statistics |
| `GET` | `/health` | Health check |

## License

Academic project — Final Year Project, IIT Sri Lanka.
