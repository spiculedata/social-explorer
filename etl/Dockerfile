# Digest-pinned base image (multi-arch index digest; bump deliberately, the Images workflow
# builds this image on every change).
FROM python:3.12-slim@sha256:191083cdf6c7bda8c76158983163ead5d5cf7b77cf3033e805bb0f5296f51b4b

# The ETL pipelines and the long-lived image worker parse untrusted posts and images, so they
# must not run as root. 1000:1000 is the usual first user on a Linux host; change both numbers if
# your bind mount is owned by someone else (docker-compose.yml's etl-init one-shot step uses the
# same numbers, like jupyter-init).
ARG ETL_UID=1000
ARG ETL_GID=1000
RUN groupadd --non-unique --gid ${ETL_GID} etl \
    && useradd --non-unique --uid ${ETL_UID} --gid ${ETL_GID} --create-home --shell /usr/sbin/nologin etl

WORKDIR /app

# Install system dependencies for psycopg2 and DuckDB
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    libgl1 \
    libglib2.0-0 \
    libxcb1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# requirements.lock pins every package, direct and transitive (see its header)
COPY requirements-etl.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements-etl.txt -c requirements.lock

COPY . .

RUN chown -R etl:etl /app

USER etl

# Default command - override per-job in compose or CI
CMD ["python", "-m", "gdelt_pipeline"]
