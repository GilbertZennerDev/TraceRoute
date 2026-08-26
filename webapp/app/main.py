from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from .algorithm import runTraceRoute
from .algorithm3d import runTraceRoute3D
from . import cpp_engine

app = FastAPI(title="TraceRoute")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


def _parseWaypoints(waypoints: str = None):
	"""Query-string encoding for a list of mandatory stops: "x1,y1;x2,y2"."""
	if not waypoints:
		return None
	try:
		return [{'x': float(x), 'y': float(y)} for x, y in (pair.split(",") for pair in waypoints.split(";") if pair)]
	except ValueError:
		raise HTTPException(status_code=400, detail="Bad waypoints format, expected 'x1,y1;x2,y2'")


@app.get("/api/traceroute")
def traceroute(amountPoints: int = 100, spread: int = 500, maxHopDistance: float = 20,
				startX: float = None, startY: float = None, endX: float = None, endY: float = None,
				waypoints: str = None, engine: str = "cpp"):
	start = {'x': startX, 'y': startY} if startX is not None and startY is not None else None
	end = {'x': endX, 'y': endY} if endX is not None and endY is not None else None
	parsedWaypoints = _parseWaypoints(waypoints)
	try:
		if engine == "cpp":
			if parsedWaypoints:
				raise HTTPException(status_code=400,
					detail="Mandatory waypoints aren't supported by the C++ engine yet - switch to Python.")
			result = cpp_engine.runTraceRouteCpp(amountPoints, spread, maxHopDistance, start, end)
		else:
			result = runTraceRoute(amountPoints, spread, maxHopDistance, start, end, parsedWaypoints)
			result['engine'] = 'python'
		return result
	except ValueError as e:
		raise HTTPException(status_code=400, detail=str(e))
	except RuntimeError as e:
		raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/engine-status")
def engine_status():
	return {"cpp_available": cpp_engine.is_available()}


@app.get("/api/traceroute3d")
def traceroute3d(amountPoints: int = 100, startIndex: int = 0, endIndex: int = 1,
				spread: int = 500, maxHopDistance: float = 20):
	try:
		return runTraceRoute3D(amountPoints, startIndex, endIndex, spread, maxHopDistance)
	except ValueError as e:
		raise HTTPException(status_code=400, detail=str(e))


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
