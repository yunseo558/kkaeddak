"""FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from kkaeddak import __version__
from kkaeddak.api.router import api_router
from kkaeddak.core.config import Settings, get_settings
from kkaeddak.core.errors import DEFAULT_ERROR_RESPONSES, register_exception_handlers
from kkaeddak.db.session import create_database_engine, create_session_factory
from kkaeddak.middleware.privacy_fields import PrivacyFieldMiddleware
from kkaeddak.middleware.request_id import RequestIdMiddleware
from kkaeddak.services.ai import AiProvider


def create_app(
    settings: Settings | None = None,
    *,
    ai_provider: AiProvider | None = None,
) -> FastAPI:
    """Create an application after validating its environment settings."""
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        engine = create_database_engine(resolved_settings)
        application.state.database_engine = engine
        application.state.session_factory = create_session_factory(engine)
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(
        title=resolved_settings.app_name,
        version=__version__,
        debug=resolved_settings.debug,
        responses=DEFAULT_ERROR_RESPONSES,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.ai_provider = ai_provider
    app.add_middleware(PrivacyFieldMiddleware)
    app.add_middleware(RequestIdMiddleware)
    register_exception_handlers(app)
    app.include_router(api_router, prefix=resolved_settings.api_v1_prefix)
    return app


app = create_app()
