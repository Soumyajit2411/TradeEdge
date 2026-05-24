FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5001", "--worker-class", "uvicorn.workers.UvicornWorker", "--workers", "1", "--timeout", "60", "--keep-alive", "5"]