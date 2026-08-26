"""
Loads the compiled routing core (webapp/cpp_core/traceroute_core.cpp,
built as libtraceroute.so during the Docker image build) via ctypes and
exposes it with the same result shape runTraceRoute() (algorithm.py)
returns, so the API/frontend don't need to care which engine answered.
"""

import ctypes
from pathlib import Path

_lib = None
_load_error = None

SO_PATH = Path(__file__).resolve().parent.parent / "cpp_core" / "libtraceroute.so"


class _TraceRouteResult(ctypes.Structure):
	_fields_ = [
		("point_count", ctypes.c_int),
		("points_x", ctypes.POINTER(ctypes.c_double)),
		("points_y", ctypes.POINTER(ctypes.c_double)),
		("start_x", ctypes.c_double),
		("start_y", ctypes.c_double),
		("end_x", ctypes.c_double),
		("end_y", ctypes.c_double),
		("chain_count", ctypes.c_int),
		("chain_x", ctypes.POINTER(ctypes.c_double)),
		("chain_y", ctypes.POINTER(ctypes.c_double)),
		("direct_distance", ctypes.c_double),
		("chain_distance", ctypes.c_double),
		("detour_factor", ctypes.c_double),
		("max_hop", ctypes.c_double),
		("max_hop_satisfied", ctypes.c_int),
		("island_count", ctypes.c_int),
		("island_offsets", ctypes.POINTER(ctypes.c_int)),
		("island_point_ids", ctypes.POINTER(ctypes.c_int)),
		("bridge_count", ctypes.c_int),
		("bridge_ax", ctypes.POINTER(ctypes.c_double)),
		("bridge_ay", ctypes.POINTER(ctypes.c_double)),
		("bridge_bx", ctypes.POINTER(ctypes.c_double)),
		("bridge_by", ctypes.POINTER(ctypes.c_double)),
	]


class _TraceRouteResult3D(ctypes.Structure):
	_fields_ = [
		("point_count", ctypes.c_int),
		("points_x", ctypes.POINTER(ctypes.c_double)),
		("points_y", ctypes.POINTER(ctypes.c_double)),
		("points_z", ctypes.POINTER(ctypes.c_double)),
		("start_x", ctypes.c_double), ("start_y", ctypes.c_double), ("start_z", ctypes.c_double),
		("end_x", ctypes.c_double), ("end_y", ctypes.c_double), ("end_z", ctypes.c_double),
		("chain_count", ctypes.c_int),
		("chain_x", ctypes.POINTER(ctypes.c_double)),
		("chain_y", ctypes.POINTER(ctypes.c_double)),
		("chain_z", ctypes.POINTER(ctypes.c_double)),
		("chain_is_stop", ctypes.POINTER(ctypes.c_int)),
		("direct_distance", ctypes.c_double),
		("chain_distance", ctypes.c_double),
		("detour_factor", ctypes.c_double),
		("max_hop", ctypes.c_double),
		("max_hop_satisfied", ctypes.c_int),
		("island_count", ctypes.c_int),
		("island_offsets", ctypes.POINTER(ctypes.c_int)),
		("island_point_ids", ctypes.POINTER(ctypes.c_int)),
		("bridge_count", ctypes.c_int),
		("bridge_ax", ctypes.POINTER(ctypes.c_double)),
		("bridge_ay", ctypes.POINTER(ctypes.c_double)),
		("bridge_az", ctypes.POINTER(ctypes.c_double)),
		("bridge_bx", ctypes.POINTER(ctypes.c_double)),
		("bridge_by", ctypes.POINTER(ctypes.c_double)),
		("bridge_bz", ctypes.POINTER(ctypes.c_double)),
	]


def _load():
	global _lib, _load_error
	if _lib is not None or _load_error is not None:
		return
	try:
		lib = ctypes.CDLL(str(SO_PATH))
		lib.run_traceroute.restype = ctypes.POINTER(_TraceRouteResult)
		lib.run_traceroute.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_double,
										ctypes.c_double, ctypes.c_double, ctypes.c_double, ctypes.c_double]
		lib.free_traceroute_result.argtypes = [ctypes.POINTER(_TraceRouteResult)]

		c_double_p = ctypes.POINTER(ctypes.c_double)
		lib.run_traceroute3d.restype = ctypes.POINTER(_TraceRouteResult3D)
		lib.run_traceroute3d.argtypes = [
			ctypes.c_int, ctypes.c_int, ctypes.c_double,
			ctypes.c_double, ctypes.c_double, ctypes.c_double,
			ctypes.c_double, ctypes.c_double, ctypes.c_double,
			c_double_p, c_double_p, c_double_p, ctypes.c_int,
		]
		lib.free_traceroute_result3d.argtypes = [ctypes.POINTER(_TraceRouteResult3D)]

		_lib = lib
	except OSError as e:
		_load_error = str(e)


def is_available():
	_load()
	return _lib is not None


def runTraceRouteCpp(amountPoints, spread, maxHopDistance=20, start=None, end=None):
	_load()
	if _lib is None:
		raise RuntimeError(f"C++ engine not available: {_load_error}")

	sx, sy = (start['x'], start['y']) if start else (0, 0)
	ex, ey = (end['x'], end['y']) if end else (spread, spread)
	ptr = _lib.run_traceroute(amountPoints, spread, float(maxHopDistance), float(sx), float(sy), float(ex), float(ey))
	res = ptr.contents
	try:
		points = [{'id': i, 'x': res.points_x[i], 'y': res.points_y[i]} for i in range(res.point_count)]
		chain = [{'x': res.chain_x[i], 'y': res.chain_y[i]} for i in range(res.chain_count)]

		islands = []
		for i in range(res.island_count):
			lo, hi = res.island_offsets[i], res.island_offsets[i + 1]
			islands.append([res.island_point_ids[j] for j in range(lo, hi)])

		bridges = [
			{'a': {'x': res.bridge_ax[i], 'y': res.bridge_ay[i]}, 'b': {'x': res.bridge_bx[i], 'y': res.bridge_by[i]}}
			for i in range(res.bridge_count)
		]

		return {
			'points': points,
			'start': {'x': res.start_x, 'y': res.start_y},
			'end': {'x': res.end_x, 'y': res.end_y},
			'closest': chain,
			'chain': chain,
			'direct_distance': res.direct_distance,
			'chain_distance': res.chain_distance,
			'detour_factor': res.detour_factor,
			'max_hop': res.max_hop,
			'max_hop_satisfied': bool(res.max_hop_satisfied),
			'islands': islands,
			'bridges': bridges,
			'engine': 'cpp',
		}
	finally:
		_lib.free_traceroute_result(ptr)


def runTraceRoute3DCpp(amountPoints, spread, maxHopDistance=20, start=None, end=None, waypoints=None):
	_load()
	if _lib is None:
		raise RuntimeError(f"C++ engine not available: {_load_error}")

	sx, sy, sz = (start['x'], start['y'], start['z']) if start else (0, 0, 0)
	ex, ey, ez = (end['x'], end['y'], end['z']) if end else (spread, spread, spread)

	waypoints = waypoints or []
	n = len(waypoints)
	wx = (ctypes.c_double * n)(*(w['x'] for w in waypoints)) if n else None
	wy = (ctypes.c_double * n)(*(w['y'] for w in waypoints)) if n else None
	wz = (ctypes.c_double * n)(*(w['z'] for w in waypoints)) if n else None

	ptr = _lib.run_traceroute3d(
		amountPoints, spread, float(maxHopDistance),
		float(sx), float(sy), float(sz), float(ex), float(ey), float(ez),
		wx, wy, wz, n,
	)
	res = ptr.contents
	try:
		points = [{'id': i, 'x': res.points_x[i], 'y': res.points_y[i], 'z': res.points_z[i]} for i in range(res.point_count)]
		chain = [
			{'x': res.chain_x[i], 'y': res.chain_y[i], 'z': res.chain_z[i], 'is_stop': bool(res.chain_is_stop[i])}
			for i in range(res.chain_count)
		]

		islands = []
		for i in range(res.island_count):
			lo, hi = res.island_offsets[i], res.island_offsets[i + 1]
			islands.append([res.island_point_ids[j] for j in range(lo, hi)])

		bridges = [
			{
				'a': {'x': res.bridge_ax[i], 'y': res.bridge_ay[i], 'z': res.bridge_az[i]},
				'b': {'x': res.bridge_bx[i], 'y': res.bridge_by[i], 'z': res.bridge_bz[i]},
			}
			for i in range(res.bridge_count)
		]

		return {
			'points': points,
			'start': {'x': res.start_x, 'y': res.start_y, 'z': res.start_z},
			'end': {'x': res.end_x, 'y': res.end_y, 'z': res.end_z},
			'waypoints': waypoints,
			'closest': chain,
			'chain': chain,
			'direct_distance': res.direct_distance,
			'chain_distance': res.chain_distance,
			'detour_factor': res.detour_factor,
			'max_hop': res.max_hop,
			'max_hop_satisfied': bool(res.max_hop_satisfied),
			'islands': islands,
			'bridges': bridges,
			'engine': 'cpp',
		}
	finally:
		_lib.free_traceroute_result3d(ptr)
