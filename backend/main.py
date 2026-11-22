"""FastAPI entry point.  Run from the project root:  uvicorn backend.main:app --reload"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import ai, dashboard, games
from .services.paths import ROOT

app = FastAPI(title="Connect 4 AI & Data Science", version="1.0")


@app.exception_handler(ValueError)
@app.exception_handler(IndexError)
async def rule_error(_: Request, exc: Exception):
    # Engine rule violations (illegal move, used power-up, ...) become readable 400s.
    return JSONResponse({"detail": str(exc)}, status_code=400)


for r in (games.router, ai.router, dashboard.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


# The website is plain HTML/CSS/JS in /web: no build step, no Node.js.
app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
