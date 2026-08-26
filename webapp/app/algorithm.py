"""
Core TraceRoute algorithm, ported 1:1 from py/app.py's logic.
Same math, same function names/behavior - just no CLI/matplotlib,
returns plain data instead so it can be served over HTTP.
"""

import random as r
import heapq
from math import sqrt as sqrt
from math import acos as acos


def genPoints(amount, spread):
	points = [{'id': i, 'x': r.randint(0, spread), 'y': r.randint(0, spread)} for i in range(amount)]
	return points

def getPointPos(points, _id):
	return points[_id]

def getLineEquation(p1, p2):
	a = (p2['y'] - p1['y'])/(p2['x'] - p1['x'])
	b = p1['y'] - a * p1['x']
	return a, b

def getOrthoLine(a, point):
	if a != 0: a_o = - 1 / a
	else: a_o = - 1 / 0.001
	b_o = point['y'] - a_o * point['x']
	return a_o, b_o

def getIntersectPoint(a, b, a_o, b_o):
	div = (a - a_o)
	if div == 0: div = 0.001
	x_inter = (b_o - b)/div
	y_inter = a_o * x_inter + b_o
	return x_inter, y_inter

def getDistTwoPoints(p1, p2):
	return ((p2['y'] - p1['y'])**2 + (p2['x'] - p1['x'])**2)**.5

def PointIsBetweenStartEnd(start, end, InterSectPoint):
	x_inter = InterSectPoint['x']
	x_start = start['x']
	x_end = end['x']
	#special case x_start == x_end
	if x_start > x_end:
		tmp = x_start
		x_start = x_end
		x_end = tmp
	return (x_inter > x_start and x_inter < x_end)

def getIntersectPoint2(intersect_arr, id):
	for p in intersect_arr:
		if p['id'] == id: return (p)
	return -1

def xClosestPoints(sortedPoints, x, intersect_arr, start, end):
	cleanSortedPoints = []
	for p in sortedPoints:
		intersectPoint = getIntersectPoint2(intersect_arr, p['id'])
		if intersectPoint == -1: raise ValueError("Bad Intersect Point")
		if PointIsBetweenStartEnd(start, end, intersectPoint['p']):
			cleanSortedPoints.append(p)
	arr = cleanSortedPoints[:x]
	return arr

def buildEvenChain(candidateIds, points, start, end, amount):
	"""
	Greedily walks a chain start -> p1 -> p2 -> ... -> pAmount -> end,
	picking at each step the unused corridor candidate whose REAL distance
	to the current chain tip is closest to an even split of the direct
	distance. Optimizes for the hops between chosen points being equal,
	not for the points being close to the line - a candidate further off
	the line is picked if it keeps the step size even.

	Restricted to candidates that are actually closer to `end` than the
	current chain tip is - forward progress alone still allows wide
	sideways swings though, so each candidate is additionally scored by
	how closely its direction from the current tip matches the straight
	direction to `end` (heading angle), with the even-hop-length match
	only as a secondary tiebreaker - this keeps the chain as straight as
	possible while still filling gaps roughly evenly.
	"""
	remaining = list(candidateIds)
	target = getDistTwoPoints(start, end) / (amount + 1)
	pathIds = []
	current = start
	for _ in range(amount):
		if not remaining: break
		distToEndNow = getDistTwoPoints(current, end)
		forward = [cid for cid in remaining if getDistTwoPoints(getPointPos(points, cid), end) < distToEndNow]
		pool = forward if forward else remaining

		dx1 = end['x'] - current['x']
		dy1 = end['y'] - current['y']
		mag1 = sqrt(dx1 ** 2 + dy1 ** 2)

		best_id = None
		best_score = float('inf')
		for cand_id in pool:
			cand = getPointPos(points, cand_id)
			dx2 = cand['x'] - current['x']
			dy2 = cand['y'] - current['y']
			mag2 = sqrt(dx2 ** 2 + dy2 ** 2)
			if mag1 == 0 or mag2 == 0: continue
			cos_angle = max(-1.0, min(1.0, (dx1 * dx2 + dy1 * dy2) / (mag1 * mag2)))
			heading_angle = acos(cos_angle)
			hop_diff = abs(mag2 - target) / target if target else 0
			score = heading_angle + 0.4 * hop_diff
			if score <= best_score:
				best_score = score
				best_id = cand_id
		if best_id is None: best_id = pool[0]

		pathIds.append(best_id)
		current = getPointPos(points, best_id)
		remaining.remove(best_id)
	return pathIds

def getChainDistance(pathIds, points, start, end):
	total = 0
	prev = start
	for pid in pathIds:
		p = getPointPos(points, pid)
		total += getDistTwoPoints(prev, p)
		prev = p
	total += getDistTwoPoints(prev, end)
	return total

def getMaxHop(chainIds, points, start, end):
	hops = [start] + [getPointPos(points, cid) for cid in chainIds] + [end]
	return max(getDistTwoPoints(hops[i], hops[i + 1]) for i in range(len(hops) - 1))

def findChainWithMaxHop(candidateIds, points, start, end, maxHopDistance, amountCap=60):
	"""
	The client doesn't pick a waypoint count - they pick the one thing
	that actually matters to them (e.g. "max 200km between stops", so a
	truck can refuel/deliver along the way). This tries chain lengths from
	0 upward and returns the FIRST (i.e. shortest/straightest) one where
	every single hop - start to waypoint, waypoint to waypoint, waypoint
	to end - is within maxHopDistance.

	How far it searches scales with how many stops a tight maxHopDistance
	could plausibly require (directDistance / maxHopDistance), not a fixed
	guess - a fixed cap like 30 silently fails (and produces a chaotic
	worst-case chain, see below) as soon as a request needs more stops
	than that, which a small maxHopDistance on a big map does immediately.

	If nothing up to that search width manages to satisfy the constraint
	(corridor too sparse, or maxHopDistance too small even for the search
	width), it returns the BEST attempt seen - the one with the smallest
	max_hop across every amount tried, not just the last one - with
	satisfied=False, so a genuinely infeasible request still gets the
	least-bad chain instead of whatever the final, most-constrained
	attempt happened to produce.
	"""
	directDistance = getDistTwoPoints(start, end)
	needed = int(directDistance // maxHopDistance) + 2 if maxHopDistance > 0 else amountCap
	maxAmount = min(len(candidateIds), amountCap, max(needed, 1))

	bestFallback = None
	for amount in range(0, maxAmount + 1):
		chainIds = buildEvenChain(candidateIds, points, start, end, amount) if amount > 0 else []
		maxHop = getMaxHop(chainIds, points, start, end)
		chainDistance = getChainDistance(chainIds, points, start, end)
		detourFactor = chainDistance / directDistance if directDistance else float('inf')
		result = {
			'chainIds': chainIds, 'chain_distance': chainDistance,
			'detour_factor': detourFactor, 'max_hop': maxHop,
		}
		if maxHop <= maxHopDistance:
			result['satisfied'] = True
			return result
		if bestFallback is None or maxHop < bestFallback['max_hop'] - 1e-9:
			bestFallback = result

	if bestFallback is not None:
		bestFallback['satisfied'] = False
	return bestFallback

def buildCorridorIds(points, candidateIds, start, end):
	"""Filters candidateIds down to the ones whose orthogonal projection
	onto the start->end line actually falls between them - the same
	filter runTraceRoute always used, pulled out so it can be reused for
	a whole map OR scoped to a single island's points (see below)."""
	a, b = getLineEquation(start, end)
	dist_arr = []
	intersect_arr = []
	for pid in candidateIds:
		p = points[pid]
		a_o, b_o = getOrthoLine(a, p)
		x_inter, y_inter = getIntersectPoint(a, b, a_o, b_o)
		p1 = {'x': x_inter, 'y': y_inter}
		intersect_arr.append({'id': p['id'], 'p': p1})
		distance = getDistTwoPoints(p1, p)
		dist_arr.append({'id': p['id'], 'distance': round(distance, 0)})
	dist_arr_sorted = sorted(dist_arr, key=lambda x: x['distance'])
	corridorPoints = xClosestPoints(dist_arr_sorted, len(dist_arr_sorted), intersect_arr, start, end)
	return [p['id'] for p in corridorPoints]


# --- "NYC principle": islands connected by single bridge points --------
#
# A flat corridor across the WHOLE map assumes free-space travel between
# any two waypoints, which is exactly the assumption real geography
# breaks (rivers, city blocks, no direct road). This is the fix that was
# prototyped in py/islands.py: cluster the map into dense "islands"
# (like Manhattan/Brooklyn/Queens), connect neighboring islands by
# exactly the one closest point-pair between them (like a single
# bridge), and only ever run the cheap corridor+chain algorithm INSIDE
# one island at a time - the case it's actually good at. Crossing
# between islands is a lookup in a tiny graph (one node per island),
# not a search over every point on the map.
#
# This is now the DEFAULT routing path (see runTraceRoute), not a
# separate demo - with only 1 island (few points, or the whole map
# turns out to be one connected blob) it degenerates to exactly the old
# flat single-corridor behavior.

def pickIslandCount(amountPoints):
	if amountPoints < 20: return 1
	return max(2, min(8, round(sqrt(amountPoints) / 4)))

def clusterIslands(points, k, iterations=15):
	if k <= 1 or len(points) <= k:
		return [list(points)]

	centers = [dict(p) for p in r.sample(points, k)]
	assignment = [0] * len(points)

	for _ in range(iterations):
		for i, p in enumerate(points):
			assignment[i] = min(range(k), key=lambda c: getDistTwoPoints(p, centers[c]))
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
	return [isl for isl in islands if isl]

def findContactPoints(islands, sampleCap=150):
	"""For every pair of islands, the single closest point pair becomes
	their one bridge. Each island's search is capped to a random sample
	(sampleCap) so this stays fast even with large, populous islands -
	an O(k^2 * sampleCap^2) bound instead of O(k^2 * n^2)."""
	k = len(islands)
	samples = [r.sample(isl, min(len(isl), sampleCap)) if isl else [] for isl in islands]
	contacts = {}
	for i in range(k):
		for j in range(i + 1, k):
			if not samples[i] or not samples[j]: continue
			bestPair, bestDist = None, float('inf')
			for a in samples[i]:
				for b in samples[j]:
					d = getDistTwoPoints(a, b)
					if d < bestDist:
						bestDist, bestPair = d, (a, b)
			if bestPair:
				contacts[(i, j)] = {'a': bestPair[0], 'b': bestPair[1], 'distance': bestDist}
	return contacts

def buildIslandGraph(k, contacts):
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
	if distArr[endIsland] == float('inf'): return None
	path = [endIsland]
	while path[-1] != startIsland:
		path.append(prev[path[-1]])
	path.reverse()
	return path

def islandCentroid(island):
	return {'x': sum(p['x'] for p in island) / len(island), 'y': sum(p['y'] for p in island) / len(island)}

def nearestIslandIndex(islands, point):
	return min(range(len(islands)), key=lambda i: getDistTwoPoints(point, islandCentroid(islands[i])))


def checks(amountPoints):
	if amountPoints < 2: raise ValueError("Bad Args")


def routeBetween(points, islands, contacts, islandGraph, a, b, maxHopDistance):
	"""
	Routes hierarchically from a to b (see the "NYC principle" block above):
	crosses the tiny island-to-island graph to pick which islands the route
	passes through, then runs the cheap corridor+chain algorithm locally
	inside one island at a time. Pulled out of runTraceRoute so a route with
	mandatory waypoints can call it once per leg (start->wp1, wp1->wp2, ...,
	wpN->end) and reuse the SAME islands/contacts every time, instead of
	re-clustering the whole map per leg.

	Returns (chainPoints, maxHop, satisfied, crossedKeys) - chainPoints is a
	list of point dicts (not ids), since a/b aren't necessarily points from
	the generated cloud (they're whatever coords the caller passed in).
	"""
	startIsland = nearestIslandIndex(islands, a)
	endIsland = nearestIslandIndex(islands, b)
	islandPath = dijkstraIslands(islandGraph, startIsland, endIsland) if startIsland != endIsland else [startIsland]
	if islandPath is None: islandPath = [startIsland, endIsland]  # disconnected islands: best-effort straight hop

	chainPoints = []
	current = a
	maxHopOverall = 0.0
	allSatisfied = True
	crossedKeys = set()
	for idx, islandIdx in enumerate(islandPath):
		islandIds = [p['id'] for p in islands[islandIdx]]
		crossing = idx < len(islandPath) - 1
		if crossing:
			nextIsland = islandPath[idx + 1]
			key = (islandIdx, nextIsland) if islandIdx < nextIsland else (nextIsland, islandIdx)
			crossedKeys.add(key)
			c = contacts.get(key)
			# 'a' always belongs to the lower-indexed island of the pair, 'b'
			# to the higher one - pick whichever side actually sits on the
			# CURRENT island as the exit point, so the chain routes there
			# instead of always favoring one side of the bridge.
			if c:
				myPoint = c['a'] if islandIdx < nextIsland else c['b']
				theirPoint = c['b'] if islandIdx < nextIsland else c['a']
			else:
				myPoint = theirPoint = b
			exitPoint = myPoint
		else:
			exitPoint = b

		corridorIds = buildCorridorIds(points, islandIds, current, exitPoint)
		best = findChainWithMaxHop(corridorIds, points, current, exitPoint, maxHopDistance)
		if best:
			chainPoints.extend(points[cid] for cid in best['chainIds'])
			maxHopOverall = max(maxHopOverall, best['max_hop'])
			allSatisfied = allSatisfied and best['satisfied']
		else:
			maxHopOverall = max(maxHopOverall, getDistTwoPoints(current, exitPoint))
			allSatisfied = False

		if crossing:
			chainPoints.append(myPoint)
			if theirPoint['id'] != myPoint['id']:
				chainPoints.append(theirPoint)
			current = theirPoint
		else:
			current = exitPoint

	return chainPoints, maxHopOverall, allSatisfied, crossedKeys


def runTraceRoute(amountPoints, spread, maxHopDistance=20, start=None, end=None, waypoints=None):
	"""
	start/end are plain {'x', 'y'} coords, independent of the generated
	point cloud - lets a caller pass whatever coordinates a user clicked
	on a map instead of only ever routing between the two opposite
	corners. Default to those corners when not given.

	waypoints (optional) is a list of {'x', 'y'} mandatory stops the route
	MUST pass through, in the given order - e.g. required delivery/pickup
	stops a client places in addition to origin/destination. The route is
	built leg by leg (start -> wp1 -> wp2 -> ... -> end), each leg routed
	with the exact same hierarchical island logic as a plain start->end
	route (see routeBetween above), sharing one island clustering for the
	whole map so results stay consistent leg to leg.
	"""
	checks(amountPoints)

	points = genPoints(amountPoints, spread)
	start = dict(start) if start else {'x': 0, 'y': 0}
	end = dict(end) if end else {'x': spread, 'y': spread}
	waypoints = [dict(w) for w in waypoints] if waypoints else []
	direct_distance = getDistTwoPoints(start, end)

	numIslands = pickIslandCount(amountPoints)
	islands = clusterIslands(points, numIslands)
	contacts = findContactPoints(islands)
	islandGraph = buildIslandGraph(len(islands), contacts)

	legs = [start] + waypoints + [end]
	fullChainPoints = []
	maxHopOverall = 0.0
	allSatisfied = True
	crossedKeysAll = set()
	for i in range(len(legs) - 1):
		a, b = legs[i], legs[i + 1]
		segChain, maxHop, satisfied, crossedKeys = routeBetween(points, islands, contacts, islandGraph, a, b, maxHopDistance)
		fullChainPoints.extend(segChain)
		maxHopOverall = max(maxHopOverall, maxHop)
		allSatisfied = allSatisfied and satisfied
		crossedKeysAll |= crossedKeys
		if i < len(legs) - 2:
			# The mandatory waypoint itself becomes part of the drawn chain,
			# flagged so the frontend can render it distinctly from an
			# auto-picked corridor point.
			marker = dict(b)
			marker['is_stop'] = True
			fullChainPoints.append(marker)

	chain_full = fullChainPoints
	chain_distance = 0.0
	prev = start
	for p in fullChainPoints:
		chain_distance += getDistTwoPoints(prev, p)
		prev = p
	chain_distance += getDistTwoPoints(prev, end)
	detour_factor = chain_distance / direct_distance if direct_distance else 1.0

	bridgesUsed = [
		{'a': {'x': c['a']['x'], 'y': c['a']['y']}, 'b': {'x': c['b']['x'], 'y': c['b']['y']}}
		for key, c in contacts.items() if key in crossedKeysAll
	]

	return {
		'points': points,
		'start': start,
		'end': end,
		'waypoints': waypoints,
		'closest': chain_full,
		'direct_distance': direct_distance,
		'chain': chain_full,
		'chain_distance': chain_distance,
		'detour_factor': detour_factor,
		'max_hop': maxHopOverall,
		'max_hop_satisfied': allSatisfied,
		'islands': [[p['id'] for p in isl] for isl in islands],
		'bridges': bridgesUsed,
	}
