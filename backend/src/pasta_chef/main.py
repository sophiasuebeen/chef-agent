"""API server entry point: uvicorn pasta_chef.main:app"""
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from pasta_chef.api.errors import validation_error_handler
from pasta_chef.api.routes import menus, orders, runs, sessions
from pasta_chef.api.store import RunStore
from pasta_chef.runtime.sessions import SessionStore


def create_app() -> FastAPI:
    app = FastAPI(title="Pasta Chef API")
    app.state.runs = RunStore()
    app.state.sessions = SessionStore()
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(menus.router)
    app.include_router(runs.router)
    app.include_router(orders.router)
    app.include_router(sessions.router)
    return app


app = create_app()
