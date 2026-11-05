"""One error format for the API: {"detail": "<message>"}."""
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from pasta_chef.api.schemas import ErrorResponse


def safe_text(text: str) -> str:
    """Escape unpaired surrogates, which JSON requests can contain but UTF-8 cannot encode."""
    return text.encode("utf-8", "backslashreplace").decode("utf-8")


async def validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
    # FastAPI's default handler echoes the input, and NaN or surrogates there fail to render.
    problems = (f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in error.errors())
    return JSONResponse(status_code=422, content={"detail": safe_text("; ".join(problems))})


def error_responses(*codes: int) -> dict:
    """OpenAPI declarations for the given status codes."""
    return {code: {"model": ErrorResponse} for code in codes}
