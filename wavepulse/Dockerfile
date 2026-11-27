# Digest-pinned base image (multi-arch index digest; bump deliberately, the Images workflow
# builds this image on every change).
FROM python:3.13-slim@sha256:7249d5587b78209a006dc4a3b5340678f84ea729239193aa559962cd8c1fce50

# The radio worker records audio and parses network input, so it must not run as root.
# 1000:1000 is the usual first user on a Linux host; change both numbers if your bind mount is
# owned by someone else (docker-compose.yml's wavepulse-init one-shot step uses the same numbers).
ARG WAVEPULSE_UID=1000
ARG WAVEPULSE_GID=1000
RUN groupadd --non-unique --gid ${WAVEPULSE_GID} wavepulse \
    && useradd --non-unique --uid ${WAVEPULSE_UID} --gid ${WAVEPULSE_GID} --create-home --shell /usr/sbin/nologin wavepulse

WORKDIR /app

# System deps for audio processing + ffmpeg + curl (the compose healthcheck runs curl)
RUN apt-get update && apt-get install -y \
    curl \
    ffmpeg \
    libsndfile1 \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# requirements.lock pins every package, direct and transitive (see its header)
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.txt -c requirements.lock

# PyTorch CPU-only (separate install to avoid index conflict). The constraint file pins the
# versions to the same ones the requirements install resolved, and --force-reinstall --no-deps
# makes this really replace the torch wheel pip pulled from PyPI (whose linux wheel bundles CUDA)
# with the CPU build, without touching its already-satisfied dependencies.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu --force-reinstall --no-deps -c requirements.lock torch torchaudio

# NLTK data is shared by every user, so it lives outside any home directory (mirrors jupyter/Dockerfile)
ENV NLTK_DATA=/usr/share/nltk_data
RUN python -c "import nltk; [nltk.download(p, download_dir='/usr/share/nltk_data') for p in ['punkt', 'punkt_tab', 'stopwords', 'vader_lexicon']]"

# Copy WavePulse source
COPY src/ /app/src/
COPY assets/ /app/assets/
COPY api_server.py /app/api_server.py

# Data directories
RUN mkdir -p /app/data/recordings /app/data/transcripts /app/data/classified \
    && chown -R wavepulse:wavepulse /app

# CPU mode defaults
ENV DEVICE=cpu
ENV COMPUTE_TYPE=float32
ENV WAVEPULSE_PORT=8890

EXPOSE 8890

USER wavepulse

# Run the API server (which can start/stop WavePulse)
CMD ["python", "api_server.py"]
