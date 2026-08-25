from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from .algorithm import runTraceRoute

app = FastAPI(title="TraceRoute")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@app.get("/api/traceroute")
def traceroute(amountPoints: int = 100, startIndex: int = 0, endIndex: int = 1,
				amountClosestPoints: int = 5, spread: int = 500):
	try:
		return runTraceRoute(amountPoints, startIndex, endIndex, amountClosestPoints, spread)
	except ValueError as e:
		raise HTTPException(status_code=400, detail=str(e))


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
