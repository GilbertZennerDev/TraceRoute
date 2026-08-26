"""
Prototype for hierarchical "island" routing, for networks with patchy
connectivity (real cities, not an open field). Idea: a region is split
into densely-connected "islands" (like Manhattan/Brooklyn/Queens), and
neighboring islands are joined by exactly ONE contact-point pair (like a
single bridge). A one-time, expensive analysis finds the islands and their
contact points and caches the result; at query time, the existing
TraceRoute algorithm (algorithm.py's buildEvenChain, ported here) only
ever has to run WITHIN one island at a time - the cheap, local case it's
actually good at - while the macro route between islands is just a lookup
in the cached structure.

Pipeline:
  1. clusterIslands()   - one-time: group points into islands (k-means).
  2. findContactPoints() - one-time: for each pair of adjacent islands,
     the closest point pair becomes the single "bridge".
  3. buildIslandGraph()  - one-time: a tiny graph over island contact
     points only (few dozen nodes, not thousands) - cheap to search.
  4. routeAcrossIslands() - per query: Dijkstra on that tiny macro-graph
     to pick which islands/bridges to use, then TraceRoute's own
     buildEvenChain runs locally inside each island crossed.

This directly answers the "no connectivity guarantee" gap: the island
structure encodes real reachability (only real bridges connect islands),
while the fast per-point algorithm only ever runs where a direct hop is
known-good (inside one island).
"""

import random as r
import heapq
from math import sqrt as sqrt


def genPoints(amount, spread):
	return [{'id': i, 'x': r.randint(0, spread), 'y': r.randint(0, spread)} for i in range(amount)]

def dist(p1, p2):
	return sqrt((p2['x'] - p1['x']) ** 2 + (p2['y'] - p1['y']) ** 2)


# --- Step 1: one-time island detection (simple k-means) ------------------

def clusterIslands(points, k, iterations=20):
	centers = [dict(p) for p in r.sample(points, k)]
	assignment = [0] * len(points)

	for _ in range(iterations):
		for i, p in enumerate(points):
			best = min(range(k), key=lambda c: dist(p, centers[c]))
			assignment[i] = best

		for c in range(k):
			members = [points[i] for i in range(len(points)) if assignment[i] == c]
			if not members: continue
			centers[c] = {
				'x': sum(m['x'] for m in members) / len(members),
				'y': sum(m['y'] for m in members) / len(members),
			}

	islands = [[] for _ in range(k)]
	for i, p in enumerate(points):
		islands[assignment[i]].append(p)
	return islands


# --- Step 2: one-time contact-point detection -----------------------------

def findContactPoints(islands):
	"""For every pair of islands, the single closest point pair becomes
	their one bridge - mirrors "there's exactly one bridge to the next
	borough"."""
	k = len(islands)
	contacts = {}
	for i in range(k):
		for j in range(i + 1, k):
			if not islands[i] or not islands[j]: continue
			bestPair = None
			bestDist = float('inf')
			for a in islands[i]:
				for b in islands[j]:
					d = dist(a, b)
					if d < bestDist:
						bestDist = d
						bestPair = (a, b)
			if bestPair:
				contacts[(i, j)] = {'a': bestPair[0], 'b': bestPair[1], 'distance': bestDist}
	return contacts


# --- Step 3: one-time macro-graph over islands ----------------------------

def buildIslandGraph(islands, contacts):
	"""Tiny graph: one node per island, one edge per bridge. Cheap to
	search regardless of how many points are inside each island."""
	k = len(islands)
	adj = [[] for _ in range(k)]
	for (i, j), c in contacts.items():
		adj[i].append((j, c['distance']))
		adj[j].append((i, c['distance']))
	return adj


def dijkstraIslands(adj, startIsland, endIsland):
	k = len(adj)
	distArr = [float('inf')] * k
	prev = [None] * k
	distArr[startIsland] = 0
	pq = [(0, startIsland)]
	visited = [False] * k
	while pq:
		d, u = heapq.heappop(pq)
		if visited[u]: continue
		visited[u] = True
		if u == endIsland: break
		for v, w in adj[u]:
			nd = d + w
			if nd < distArr[v]:
				distArr[v] = nd
				prev[v] = u
				heapq.heappush(pq, (nd, v))

	if distArr[endIsland] == float('inf'):
		return None
	path = [endIsland]
	while path[-1] != startIsland:
		path.append(prev[path[-1]])
	path.reverse()
	return path


# --- Step 4: per-query local routing (reuses algorithm.py's approach) -----

def buildEvenChain(candidates, start, end, amount):
	"""Same greedy heading+even-hop chain as algorithm.py's buildEvenChain,
	scoped to run only WITHIN one island at a time."""
	remaining = list(candidates)
	target = dist(start, end) / (amount + 1) if amount else dist(start, end)
	pathPts = []
	current = start
	for _ in range(amount):
		if not remaining: break
		distToEndNow = dist(current, end)
		forward = [c for c in remaining if dist(c, end) < distToEndNow]
		pool = forward if forward else remaining

		d1x, d1y = end['x'] - current['x'], end['y'] - current['y']
		mag1 = sqrt(d1x ** 2 + d1y ** 2)

		best = None
		bestScore = float('inf')
		for cand in pool:
			d2x, d2y = cand['x'] - current['x'], cand['y'] - current['y']
			mag2 = sqrt(d2x ** 2 + d2y ** 2)
			if mag1 == 0 or mag2 == 0: continue
			cos_angle = max(-1.0, min(1.0, (d1x * d2x + d1y * d2y) / (mag1 * mag2)))
			from math import acos
			heading = acos(cos_angle)
			hopDiff = abs(mag2 - target) / target if target else 0
			score = heading + 0.4 * hopDiff
			if score <= bestScore:
				bestScore = score
				best = cand
		if best is None: best = pool[0]

		pathPts.append(best)
		current = best
		remaining.remove(best)
	return pathPts


def routeAcrossIslands(islands, contacts, islandGraph, startIsland, endIsland, startPt, endPt, perIslandAmount):
	"""Per-query: cheap Dijkstra over the tiny island graph, then
	TraceRoute's own logic runs locally inside every island on the path."""
	islandPath = dijkstraIslands(islandGraph, startIsland, endIsland)
	if islandPath is None:
		return None

	fullChain = [startPt]
	for idx in range(len(islandPath)):
		island = islandPath[idx]
		entry = fullChain[-1]

		if idx < len(islandPath) - 1:
			nextIsland = islandPath[idx + 1]
			key = (island, nextIsland) if island < nextIsland else (nextIsland, island)
			c = contacts[key]
			exitPt = c['a'] if island < nextIsland else c['b']
		else:
			exitPt = endPt

		local = buildEvenChain(islands[island], entry, exitPt, perIslandAmount)
		fullChain.extend(local)
		fullChain.append(exitPt)

	total = sum(dist(fullChain[i], fullChain[i + 1]) for i in range(len(fullChain) - 1))
	return {'islandPath': islandPath, 'chain': fullChain, 'chain_distance': total}


def runIslandDemo(amountPoints, numIslands, spread, perIslandAmount):
	points = genPoints(amountPoints, spread)
	islands = clusterIslands(points, numIslands)
	contacts = findContactPoints(islands)
	islandGraph = buildIslandGraph(islands, contacts)

	startIsland = max(range(numIslands), key=lambda c: len(islands[c]) and -sum(p['x'] + p['y'] for p in islands[c]) / len(islands[c]))
	nonEmpty = [i for i in range(numIslands) if islands[i]]
	startIsland, endIsland = nonEmpty[0], nonEmpty[-1]
	startPt = min(islands[startIsland], key=lambda p: p['x'] + p['y'])
	endPt = max(islands[endIsland], key=lambda p: p['x'] + p['y'])

	result = routeAcrossIslands(islands, contacts, islandGraph, startIsland, endIsland, startPt, endPt, perIslandAmount)
	direct = dist(startPt, endPt)

	return {
		'points': points,
		'islands': islands,
		'contacts': contacts,
		'start': startPt,
		'end': endPt,
		'route': result,
		'direct_distance': direct,
		'detour_factor': result['chain_distance'] / direct if result and direct else None,
	}


if __name__ == '__main__':
	res = runIslandDemo(amountPoints=400, numIslands=6, spread=1000, perIslandAmount=5)
	print(f"Islands: {len(res['islands'])} (sizes: {[len(i) for i in res['islands']]})")
	print(f"Contact-point bridges: {len(res['contacts'])}")
	print(f"Island path: {res['route']['islandPath']}")
	print(f"Chain length: {len(res['route']['chain'])} points")
	print(f"Chain distance: {res['route']['chain_distance']:.1f}")
	print(f"Direct distance: {res['direct_distance']:.1f}")
	print(f"Detour factor: {res['detour_factor']:.2f}x")
