FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY services/outreach-deep-sync/deep_sync.py /app/deep_sync.py

USER nobody
CMD ["python", "/app/deep_sync.py", "--serve", "--host", "0.0.0.0"]
