r"""Point d'entrée FastAPI — Nexora Smart Stock AI.

Démarrage local (Windows) :
    backend\.venv\Scripts\Activate.ps1
    uvicorn app.main:app --reload --port 8000

Le serveur :
  • vérifie la connexion MongoDB et crée les index (idempotent, non destructif) ;
  • n'exécute JAMAIS d'opération destructive (drop, delete global, migration) ;
  • démarre optionnellement le worker embarqué (dev) si WORKER_EMBEDDED=true.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app import __version__
from app.api.v1 import api_router, ws
from app.core import db as core_db
from app.core.config import get_settings
from app.core.errors import DomainError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.db = core_db.get_database()
    app.state.worker_task = None

    connected = await core_db.ping()
    if connected:
        await core_db.ensure_indexes(app.state.db)
        logger.info("MongoDB connecté — index vérifiés (base %r).", settings.mongodb_database)
    else:
        logger.warning(
            "MongoDB injoignable sur %s — l'API démarre en mode dégradé. "
            "Vérifiez que le service MongoDB 7.0.11 est démarré.",
            settings.mongodb_uri,
        )

    if settings.worker_embedded:
        from app.workers.main import worker_loop

        app.state.worker_task = asyncio.create_task(worker_loop())
        logger.info("Worker embarqué démarré (WORKER_EMBEDDED=true).")

    ws.bridge_event_bus()
    yield

    if app.state.worker_task:
        app.state.worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await app.state.worker_task
    await core_db.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api/v1")

    @app.exception_handler(DomainError)
    async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.code, "message": exc.message},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "payload"
        return JSONResponse(
            status_code=422,
            content={
                "error": "validation_error",
                "message": f"Champ invalide ou manquant : {field}.",
            },
        )

    @app.exception_handler(Exception)
    async def generic_handler(_: Request, exc: Exception) -> JSONResponse:
        from pymongo.errors import AutoReconnect, ServerSelectionTimeoutError

        if isinstance(exc, (ServerSelectionTimeoutError, AutoReconnect)):
            return JSONResponse(
                status_code=503,
                content={
                    "error": "database_unavailable",
                    "message": "Base de données indisponible — vérifiez que MongoDB est démarré.",
                },
            )
        logger.exception("Erreur interne : %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "message": "Erreur interne du serveur."},
        )

    return app


app = create_app()
