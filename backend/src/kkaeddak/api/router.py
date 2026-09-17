"""Versioned API router."""

from fastapi import APIRouter

from kkaeddak.api.contract_routes import router as contract_router

api_router = APIRouter()
api_router.include_router(contract_router)
