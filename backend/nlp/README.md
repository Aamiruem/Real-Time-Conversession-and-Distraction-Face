# nlp — text analysis engine

Pure Python + VADER, so it has no server dependencies.

* `analyze_message(text)` → sentiment, toxicity, keywords (stored with each chat message)
* `analyze_text(text)` → the full breakdown used by the AI Lab (hedges, assertive phrases, confidence, summary)
* `text_confidence(texts)` → 0-100 score for how decisive the wording is
* `conversation_insights(rows)` → room-level sentiment mix, top keywords, summary, per-user confidence

The backend wrapper (`backend/app/services/nlp_service.py`) can swap sentiment for Amazon Comprehend.
