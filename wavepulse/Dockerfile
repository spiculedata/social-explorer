FROM python:3.13-slim

WORKDIR /app

# System deps for audio processing + ffmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# PyTorch CPU-only (separate install to avoid index conflict)
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchaudio

# Download NLTK data
RUN python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab'); nltk.download('stopwords'); nltk.download('vader_lexicon')"

# Copy WavePulse source
COPY src/ /app/src/
COPY assets/ /app/assets/
COPY api_server.py /app/api_server.py

# Data directories
RUN mkdir -p /app/data/recordings /app/data/transcripts /app/data/classified

# The schedule files and recordings must be writable by the service user; the
# image runs non-root (uid/gid 1000, like the UI image) so a compromised
# endpoint cannot write outside its volumes. compose's wavepulse-init hands the
# bind-mounted data directory to this user before the service starts.
RUN groupadd -g 1000 wavepulse && useradd -u 1000 -g 1000 -m wavepulse \
    && mkdir -p /app/assets \
    && chown -R wavepulse:wavepulse /app/data /app/assets
USER wavepulse

# CPU mode defaults
ENV DEVICE=cpu
ENV COMPUTE_TYPE=float32
ENV WAVEPULSE_PORT=8890

EXPOSE 8890

# Run the API server (which can start/stop WavePulse) under a production server
CMD ["python", "api_server.py"]
