"""Search by meaning: Hugging Face sentence embeddings (PyTorch) over the coach's guide.

Finds "my mind goes blank when I present" under advice on nerves, with no words in common. Optional: without
sentence-transformers, or with SEMANTIC_SEARCH=off, or if the model can't be loaded, search() returns None and the coach
uses keyword search alone. The model downloads once (about 90 MB) and is held in memory after the first question.
"""
import logging
import os
import threading
from importlib.util import find_spec

log = logging.getLogger(__name__)

MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
_lock = threading.Lock()
_model = None
_vectors = None
_failed = False


def enabled() -> bool:
    return os.getenv("SEMANTIC_SEARCH", "on") != "off" and not _failed and find_spec("sentence_transformers") is not None


def _prepare(docs: list[str]):
    """Load the model and embed the passages, once. A failure (e.g. offline first run) turns the feature off."""
    global _model, _vectors, _failed
    with _lock:
        if _vectors is None and not _failed:
            try:
                from sentence_transformers import SentenceTransformer

                _model = SentenceTransformer(MODEL, device="cpu")
                _vectors = _model.encode(docs, normalize_embeddings=True, show_progress_bar=False)
            except Exception as e:  # noqa: BLE001 - keyword search still answers
                _failed = True
                log.warning("semantic search off (%s): using keyword search", e.__class__.__name__)


def search(question: str, docs: list[str]) -> list[tuple[int, float]] | None:
    """Every passage's index and similarity (0-1), best first; None when semantic search isn't available."""
    if not enabled():
        return None
    _prepare(docs)
    if _vectors is None:
        return None
    query = _model.encode([question], normalize_embeddings=True, show_progress_bar=False)[0]
    sims = _vectors @ query
    return [(int(i), float(sims[i])) for i in sims.argsort()[::-1]]
