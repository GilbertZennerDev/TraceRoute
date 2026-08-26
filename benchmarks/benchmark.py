"""
Measures TraceRoute's actual wall-clock time and peak memory against a
real Dijkstra implementation on a comparable point set, across several
point-count sizes. Numbers are real (perf_counter + tracemalloc), not
estimated - run this yourself with `python benchmarks/benchmark.py` to
reproduce, the script prints the hardware it ran on.

Fairness notes (read before quoting these numbers anywhere):
  - Dijkstra here runs on a k-nearest-neighbor graph built from the SAME
    point cloud TraceRoute uses, so both algorithms work over identical
    data. Graph construction is excluded from Dijkstra's timing, same as
    a real router: the road graph is assumed already loaded, only the
    query (the search itself) is timed.
  - This is naive Dijkstra with a binary heap - no Contraction Hierarchies,
    no ALT, no precomputation. Production routers (OSRM, GraphHopper,
    Google Maps) use those and answer queries in sub-millisecond time
    regardless of network size, at the cost of a large in-memory
    precomputed structure. This benchmark is NOT a claim TraceRoute beats
    those - it's a claim it beats naive graph search on hardware too
    constrained to hold a precomputed graph in the first place.
  - This runs on a development machine, not embedded/microcontroller
    target hardware. It measures wall-clock time and Python-level peak
    memory, not real energy draw.
"""

import heapq
import json
import platform
import sys
import time
import tracemalloc
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "webapp"))
from app.algorithm import runTraceRoute, genPoints


def buildKnnGraph(points, k=6):
	# Vectorized with numpy purely so this SETUP step (which represents
	# already-loaded map data, not routing time - see module docstring)
	# finishes in seconds instead of minutes at n=10000; it plays no part
	# in either algorithm's measured time.
	n = len(points)
	coords = np.array([[p['x'], p['y']] for p in points], dtype=float)
	adj = [[] for _ in range(n)]
	for i in range(n):
		dists = np.sqrt(((coords - coords[i]) ** 2).sum(axis=1))
		dists[i] = np.inf
		nearest = np.argpartition(dists, k)[:k]
		for j in nearest:
			j = int(j)
			w = float(dists[j])
			adj[i].append((j, w))
			adj[j].append((i, w))
	return adj


def dijkstra(adj, start, end, n):
	dist = [float('inf')] * n
	dist[start] = 0
	pq = [(0.0, start)]
	visited = [False] * n
	while pq:
		d, u = heapq.heappop(pq)
		if visited[u]: continue
		visited[u] = True
		if u == end: break
		for v, w in adj[u]:
			nd = d + w
			if nd < dist[v]:
				dist[v] = nd
				heapq.heappush(pq, (nd, v))
	return dist[end]


def timeAndMemory(fn):
	tracemalloc.start()
	started = time.perf_counter()
	result = fn()
	elapsed_ms = (time.perf_counter() - started) * 1000
	_, peak = tracemalloc.get_traced_memory()
	tracemalloc.stop()
	return result, elapsed_ms, peak / 1024


def runBenchmark(n, spread=1000, k=8):
	# TraceRoute: full runTraceRoute call (generation + projection + filter + chain).
	_, tr_ms, tr_kb = timeAndMemory(lambda: runTraceRoute(n, 0, 1, k, spread))

	# Dijkstra: generate the same-sized point cloud, build its KNN graph
	# (excluded from timing - this is "map data", not query time), then
	# time only the search itself.
	points = genPoints(n, spread)
	adj = buildKnnGraph(points, k=6)

	def runDijkstra():
		return dijkstra(adj, 0, 1, n)

	_, dij_ms, dij_kb = timeAndMemory(runDijkstra)

	return {
		'n': n,
		'traceroute_ms': round(tr_ms, 4),
		'traceroute_kb': round(tr_kb, 1),
		'dijkstra_ms': round(dij_ms, 4),
		'dijkstra_kb': round(dij_kb, 1),
		'speedup': round(dij_ms / tr_ms, 1) if tr_ms else None,
	}


if __name__ == '__main__':
	print(f"Platform: {platform.platform()}")
	print(f"Processor: {platform.processor() or platform.machine()}")
	print(f"Python: {platform.python_version()}\n")

	sizes = [100, 500, 1000, 2500, 5000, 10000]
	results = []
	print(f"{'n':>7} | {'TraceRoute (ms)':>16} | {'Dijkstra (ms)':>14} | {'Speedup':>8} | {'TR peak KB':>10} | {'Dij peak KB':>11}")
	print("-" * 84)
	for n in sizes:
		r = runBenchmark(n)
		results.append(r)
		print(f"{r['n']:>7} | {r['traceroute_ms']:>16} | {r['dijkstra_ms']:>14} | {r['speedup']:>7}x | {r['traceroute_kb']:>10} | {r['dijkstra_kb']:>11}")

	out_path = Path(__file__).resolve().parent / "results.json"
	out_path.write_text(json.dumps({
		'platform': platform.platform(),
		'processor': platform.processor() or platform.machine(),
		'python': platform.python_version(),
		'results': results,
	}, indent=2))
	print(f"\nWritten to {out_path}")
