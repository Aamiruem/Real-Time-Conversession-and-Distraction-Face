FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY requirements-backend.txt .
RUN pip install --no-cache-dir -r requirements-backend.txt
COPY nlp ./nlp
COPY ml ./ml
COPY speech ./speech
COPY backend ./backend
# Train the bootstrap fatigue model into the image (retrain later with: python -m ml.train --with-db)
RUN python -m ml.train && python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
