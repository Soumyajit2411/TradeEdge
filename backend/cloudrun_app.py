"""Cloud Run entry point — stateless REST APIs only.

Not included (lives in the Docker/Oracle container):
  - Delta Exchange WebSocket listener
  - Supabase Realtime broadcast loop
  - Daily email scheduler
"""

import logging

import config
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routes.ai import router as ai_router
from routes.delta import router as delta_router
from routes.news import router as news_router
from routes.notify import router as notify_router
from routes.users import router as users_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
config.validate()

app = FastAPI()

_origins = config.CORS_ORIGINS if isinstance(config.CORS_ORIGINS, list) else [config.CORS_ORIGINS]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_headers=["Authorization", "Content-Type"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_credentials=False,
)


# Keep {"error": "..."} response format for frontend compatibility.
@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


app.include_router(delta_router)
app.include_router(ai_router)
app.include_router(notify_router)
app.include_router(users_router)
app.include_router(news_router)


@app.get("/health")
def health():
    return {"ok": True}
