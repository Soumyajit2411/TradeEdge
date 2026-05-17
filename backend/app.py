"""Flask application factory and entry point."""

import logging
import os

from flask import Flask, Response, jsonify
from flask_cors import CORS

import config
from routes.delta import bp as delta_bp
from routes.ai import bp as ai_bp
from routes.notify import bp as notify_bp
from routes.users import bp as users_bp
from routes.news import bp as news_bp
from services import websocket, scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
config.validate()

app = Flask(__name__)
CORS(
    app,
    origins=config.CORS_ORIGINS,
    allow_headers=["Authorization", "Content-Type"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    supports_credentials=False,
)

app.register_blueprint(delta_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(notify_bp)
app.register_blueprint(users_bp)
app.register_blueprint(news_bp)

scheduler.start()


@app.get("/health")
def health() -> Response:
    websocket.ensure_started()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=config.PORT, debug=os.getenv("FLASK_DEBUG", "0") == "1")
