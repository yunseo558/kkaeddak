"""Versioned API router."""

from fastapi import APIRouter

from kkaeddak.api.ai_routes import router as ai_router
from kkaeddak.api.contract_routes import router as contract_router
from kkaeddak.api.core_routes import router as core_router
from kkaeddak.api.wake_flow_routes import router as wake_flow_router

api_router = APIRouter()
api_router.include_router(core_router)
api_router.include_router(wake_flow_router)
api_router.include_router(ai_router)
api_router.include_router(contract_router)
