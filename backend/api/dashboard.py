from fastapi import APIRouter, HTTPException, Query
from ..schemas.models import BenchmarkRun
from ..services import analytics as A, jobs as J

router = APIRouter(tags=["dashboard"])


def _split(v):
    return [x for x in (v or "").split(",") if x]


def _df(source, phases, scenarios):
    try:
        return A.filtered(source, _split(phases), _split(scenarios))
    except KeyError:
        raise HTTPException(404, "Unknown benchmark source")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/dashboard/sources")
def sources():
    return A.list_sources()


@router.get("/dashboard/kpis")
def kpis(source: str = "shipped", phases: str = "", scenarios: str = ""):
    return A.kpis(_df(source, phases, scenarios))


@router.get("/dashboard/charts")
def charts(source: str = "shipped", phases: str = "", scenarios: str = ""):
    return A.charts(_df(source, phases, scenarios))


@router.get("/dashboard/overview")
def overview(source: str = "shipped", phases: str = "", scenarios: str = ""):
    df = _df(source, phases, scenarios)
    return A.overview(source, df)


@router.get("/dashboard/insights")
def insights(source: str = "shipped", phases: str = "", scenarios: str = ""):
    return A.insights(_df(source, phases, scenarios))


@router.post("/benchmark/run")
def run(body: BenchmarkRun):
    try:
        return J.start(body.depth, body.scenario_ids)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))


@router.get("/benchmark/jobs/{job_id}")
def job(job_id: str):
    try:
        return J.status(job_id)
    except KeyError:
        raise HTTPException(404, "Unknown job")


@router.get("/benchmark/results")
def results(source: str = "shipped"):
    """Raw cleaned benchmark rows for the selected run."""
    df, _ = A.load(source)
    return df.where(df.notna(), None).to_dict(orient="records")
