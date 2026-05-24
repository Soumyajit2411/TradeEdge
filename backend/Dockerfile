FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["gunicorn", "cloudrun_app:app", "--bind", "0.0.0.0:8080", "--worker-class", "uvicorn.workers.UvicornWorker", "--workers", "2", "--timeout", "120"]
