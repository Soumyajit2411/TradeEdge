"""Docker entry point — WebSocket daemon, email scheduler, Supabase Realtime broadcast.

Not included here (lives in Cloud Run):
  - All stateless REST APIs (fills, candles, tickers snapshot, AI, notify, users, news)
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services import scheduler, supabase_realtime, websocket

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.getLogger("realtime").setLevel(logging.WARNING)
config.validate()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    scheduler.start()
    websocket.ensure_started()
    supabase_realtime.start()
    yield


app = FastAPI(lifespan=lifespan)

_origins = config.CORS_ORIGINS if isinstance(config.CORS_ORIGINS, list) else [config.CORS_ORIGINS]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_headers=["Authorization", "Content-Type"],
    allow_methods=["GET", "OPTIONS"],
    allow_credentials=False,
)


@app.get("/health")
def health():
    return {"ok": True}
