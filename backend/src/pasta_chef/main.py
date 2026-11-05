"""API server entry point: uvicorn pasta_chef.main:app"""
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from pasta_chef.api.errors import validation_error_handler
from pasta_chef.api.routes import orders, runs
from pasta_chef.api.store import RunStore


def create_app() -> FastAPI:
    app = FastAPI(title="Pasta Chef API")
    app.state.runs = RunStore()
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(runs.router)
    app.include_router(orders.router)
    return app


app = create_app()
