FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY .streamlit ./.streamlit
COPY cv ./cv
COPY speech ./speech
COPY frontend ./frontend
# Pre-download the speech model so the first Speech Coach analysis is fast
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"
EXPOSE 8501
CMD ["streamlit", "run", "frontend/Home.py", "--server.address=0.0.0.0", "--server.port=8501"]
