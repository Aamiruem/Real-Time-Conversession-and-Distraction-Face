# FastAPI backend — build context is backend/ (docker compose does this for you)
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY nlp ./nlp
COPY ml ./ml
COPY speech ./speech
COPY interview ./interview
COPY coach ./coach
COPY app ./app
# Train the bootstrap fatigue model into the image (retrain later with: python -m ml.train --with-db) and bake in the
# speech model, so the first analysis needs no download. WHISPER_MODEL=tiny.en for small servers (Render free).
ARG WHISPER_MODEL=base.en
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python -m ml.train && python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"
EXPOSE 8000
# PORT is set by Render / Railway / Fly / Cloud Run; docker compose uses 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips="*"
