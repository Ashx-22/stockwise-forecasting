FROM python:3.12-slim
# libgomp is required by LightGBM
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY stockwise ./stockwise
# Train at build time so the image is self-contained (about one minute). Website JSON goes to a scratch folder.
RUN python -m stockwise.pipeline --out /tmp/site-data
ENV PORT=8000
CMD ["sh", "-c", "uvicorn stockwise.api:app --host 0.0.0.0 --port ${PORT}"]
