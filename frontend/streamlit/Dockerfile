# Legacy Streamlit UI. It runs backend/cv and backend/speech in-process, so build from the repo root:
#   docker build -f frontend/streamlit/Dockerfile -t presence-streamlit .
FROM python:3.11-slim
WORKDIR /app/frontend/streamlit
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY frontend/streamlit/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/cv /app/backend/cv
COPY backend/speech /app/backend/speech
COPY backend/interview /app/backend/interview
COPY frontend/streamlit ./
# Pre-download the speech model so the first Speech Coach analysis is fast
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"
EXPOSE 8501
CMD ["streamlit", "run", "app.py", "--server.address=0.0.0.0", "--server.port=8501"]
