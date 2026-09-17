"""FastAPI application entry point."""

from fastapi import FastAPI

from kkaeddak import __version__
from kkaeddak.core.config import Settings, get_settings
from kkaeddak.core.errors import DEFAULT_ERROR_RESPONSES, register_exception_handlers
from kkaeddak.middleware.request_id import RequestIdMiddleware


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create an application after validating its environment settings."""
    resolved_settings = settings or get_settings()
    app = FastAPI(
        title=resolved_settings.app_name,
        version=__version__,
        debug=resolved_settings.debug,
        responses=DEFAULT_ERROR_RESPONSES,
    )
    app.state.settings = resolved_settings
    app.add_middleware(RequestIdMiddleware)
    register_exception_handlers(app)
    return app


app = create_app()
