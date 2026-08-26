"""
3D generalization of algorithm.py's routing logic - including the
hierarchical "NYC principle" island routing and mandatory-waypoint support
that the 2D engine has. The original 2D version projects a point onto a
line via its slope (a, b) - that doesn't generalize past 2D (there's no
single "slope" in 3D). The underlying idea generalizes cleanly through
vector projection instead: for a line through `start` with direction
d = end - start, any point P projects onto it at
t = dot(P - start, d) / dot(d, d), landing on start + t*d. t in (0, 1)
means "between start and end" - the exact same role PointIsBetweenStartEnd
played in 2D, just expressed with a scalar instead of comparing
x-coordinates. Everything downstream (distance, corridor filter,
even-chain heading score, k-means clustering) is dot-product/vector-norm
math that works identically regardless of how many coordinates a point
has - island graph crossing (buildIslandGraph/dijkstraIslands) doesn't
touch coordinates at all, so those are reused directly from algorithm.py.
"""

import random as r
from math import sqrt as sqrt
from math import acos as acos

from .algorithm import buildIslandGraph, dijkstraIslands


def genPoints3D(amount, spread):
	return [{'id': i, 'x': r.randint(0, spread), 'y': r.randint(0, spread), 'z': r.randint(0, spread)} for i in range(amount)]

def getPointPos(points, _id):
	return points[_id]

def sub(p1, p2):
	return (p1['x'] - p2['x'], p1['y'] - p2['y'], p1['z'] - p2['z'])

def dot(v1, v2):
	return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]

def norm(v):
	return sqrt(dot(v, v))

def getDistTwoPoints3D(p1, p2):
	return norm(sub(p2, p1))

def projectPointOnLine3D(p, start, end):
	d = sub(end, start)
	dd = dot(d, d)
	t = dot(sub(p, start), d) / dd if dd else 0
	proj = {'x': start['x'] + t * d[0], 'y': start['y'] + t * d[1], 'z': start['z'] + t * d[2]}
	return t, proj

def checks3D(amountPoints):
	if amountPoints < 2: raise ValueError("Bad Args")

def buildEvenChain3D(candidateIds, points, start, end, amount):
	"""Same greedy heading+even-hop chain as buildEvenChain in algorithm.py,
	generalized to 3D vectors - the heading-angle formula (dot product over
	the product of norms) is dimension-agnostic, so this is the same logic,
	not a rewrite."""
	remaining = list(candidateIds)
	target = getDistTwoPoints3D(start, end) / (amount + 1)
	pathIds = []
	current = start
	for _ in range(amount):
		if not remaining: break
		distToEndNow = getDistTwoPoints3D(current, end)
		forward = [cid for cid in remaining if getDistTwoPoints3D(getPointPos(points, cid), end) < distToEndNow]
		pool = forward if forward else remaining

		d1 = sub(end, current)
		mag1 = norm(d1)

		best_id = None
		best_score = float('inf')
		for cand_id in pool:
			cand = getPointPos(points, cand_id)
			d2 = sub(cand, current)
			mag2 = norm(d2)
			if mag1 == 0 or mag2 == 0: continue
			cos_angle = max(-1.0, min(1.0, dot(d1, d2) / (mag1 * mag2)))
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

def getChainDistance3D(pathIds, points, start, end):
	total = 0
	prev = start
	for pid in pathIds:
		p = getPointPos(points, pid)
		total += getDistTwoPoints3D(prev, p)
		prev = p
	total += getDistTwoPoints3D(prev, end)
	return total

def getMaxHop3D(chainIds, points, start, end):
	hops = [start] + [getPointPos(points, cid) for cid in chainIds] + [end]
	return max(getDistTwoPoints3D(hops[i], hops[i + 1]) for i in range(len(hops) - 1))

def findChainWithMaxHop3D(candidateIds, points, start, end, maxHopDistance, amountCap=60):
	"""Same client-facing contract as findChainWithMaxHop in algorithm.py:
	the caller sets a max distance per leg, this returns the fewest stops
	that keep every leg within it. Search width scales with how many
	stops a tight maxHopDistance could plausibly need, and on failure the
	best (smallest max hop) attempt seen is returned, not just the last."""
	directDistance = getDistTwoPoints3D(start, end)
	needed = int(directDistance // maxHopDistance) + 2 if maxHopDistance > 0 else amountCap
	maxAmount = min(len(candidateIds), amountCap, max(needed, 1))

	bestFallback = None
	for amount in range(0, maxAmount + 1):
		chainIds = buildEvenChain3D(candidateIds, points, start, end, amount) if amount > 0 else []
		maxHop = getMaxHop3D(chainIds, points, start, end)
		chainDistance = getChainDistance3D(chainIds, points, start, end)
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

def buildCorridorIds3D(points, candidateIds, start, end):
	"""3D counterpart of buildCorridorIds in algorithm.py: keeps whichever
	candidateIds project onto the start->end segment (t strictly between 0
	and 1), scoped to whatever id subset is passed in (the whole map, or a
	single island's points)."""
	ids = []
	for pid in candidateIds:
		t, _ = projectPointOnLine3D(points[pid], start, end)
		if t <= 0 or t >= 1: continue
		ids.append(pid)
	return ids


# --- "NYC principle" in 3D: islands connected by single bridge points --
# Exact same idea as the 2D island routing in algorithm.py (see the
# comment block there for the full rationale), just clustered in 3D. The
# island-graph plumbing (buildIslandGraph/dijkstraIslands) is pure
# combinatorics over island indices - no coordinate math - so it's
# imported straight from algorithm.py instead of being duplicated.

def pickIslandCount3D(amountPoints):
	if amountPoints < 20: return 1
	return max(2, min(8, round(sqrt(amountPoints) / 4)))

def clusterIslands3D(points, k, iterations=15):
	if k <= 1 or len(points) <= k:
		return [list(points)]

	centers = [dict(p) for p in r.sample(points, k)]
	assignment = [0] * len(points)

	for _ in range(iterations):
		for i, p in enumerate(points):
			assignment[i] = min(range(k), key=lambda c: getDistTwoPoints3D(p, centers[c]))
		for c in range(k):
			members = [points[i] for i in range(len(points)) if assignment[i] == c]
			if not members: continue
			centers[c] = {
				'x': sum(m['x'] for m in members) / len(members),
				'y': sum(m['y'] for m in members) / len(members),
				'z': sum(m['z'] for m in members) / len(members),
			}

	islands = [[] for _ in range(k)]
	for i, p in enumerate(points):
		islands[assignment[i]].append(p)
	return [isl for isl in islands if isl]

def findContactPoints3D(islands, sampleCap=150):
	k = len(islands)
	samples = [r.sample(isl, min(len(isl), sampleCap)) if isl else [] for isl in islands]
	contacts = {}
	for i in range(k):
		for j in range(i + 1, k):
			if not samples[i] or not samples[j]: continue
			bestPair, bestDist = None, float('inf')
			for a in samples[i]:
				for b in samples[j]:
					d = getDistTwoPoints3D(a, b)
					if d < bestDist:
						bestDist, bestPair = d, (a, b)
			if bestPair:
				contacts[(i, j)] = {'a': bestPair[0], 'b': bestPair[1], 'distance': bestDist}
	return contacts

def islandCentroid3D(island):
	return {
		'x': sum(p['x'] for p in island) / len(island),
		'y': sum(p['y'] for p in island) / len(island),
		'z': sum(p['z'] for p in island) / len(island),
	}

def nearestIslandIndex3D(islands, point):
	return min(range(len(islands)), key=lambda i: getDistTwoPoints3D(point, islandCentroid3D(islands[i])))


def routeBetween3D(points, islands, contacts, islandGraph, a, b, maxHopDistance):
	"""3D counterpart of routeBetween in algorithm.py - routes hierarchically
	from a to b via the island graph, running the corridor+chain algorithm
	locally inside one island at a time. Returns (chainPoints, maxHop,
	satisfied, crossedKeys); see algorithm.py's routeBetween for the full
	rationale, including the bridge two-sided-crossing fix."""
	startIsland = nearestIslandIndex3D(islands, a)
	endIsland = nearestIslandIndex3D(islands, b)
	islandPath = dijkstraIslands(islandGraph, startIsland, endIsland) if startIsland != endIsland else [startIsland]
	if islandPath is None: islandPath = [startIsland, endIsland]

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
			if c:
				myPoint = c['a'] if islandIdx < nextIsland else c['b']
				theirPoint = c['b'] if islandIdx < nextIsland else c['a']
			else:
				myPoint = theirPoint = b
			exitPoint = myPoint
		else:
			exitPoint = b

		corridorIds = buildCorridorIds3D(points, islandIds, current, exitPoint)
		best = findChainWithMaxHop3D(corridorIds, points, current, exitPoint, maxHopDistance)
		if best:
			chainPoints.extend(points[cid] for cid in best['chainIds'])
			maxHopOverall = max(maxHopOverall, best['max_hop'])
			allSatisfied = allSatisfied and best['satisfied']
		else:
			maxHopOverall = max(maxHopOverall, getDistTwoPoints3D(current, exitPoint))
			allSatisfied = False

		if crossing:
			chainPoints.append(myPoint)
			if theirPoint['id'] != myPoint['id']:
				chainPoints.append(theirPoint)
			current = theirPoint
		else:
			current = exitPoint

	return chainPoints, maxHopOverall, allSatisfied, crossedKeys


def runTraceRoute3D(amountPoints, spread, maxHopDistance=20, start=None, end=None, waypoints=None):
	"""
	start/end/waypoints are plain {'x', 'y', 'z'} coords, same contract as
	runTraceRoute in algorithm.py - default to opposite corners when not
	given. Routes hierarchically through 3D islands by default, leg by leg
	through any mandatory waypoints (see routeBetween3D above).
	"""
	checks3D(amountPoints)

	points = genPoints3D(amountPoints, spread)
	start = dict(start) if start else {'x': 0, 'y': 0, 'z': 0}
	end = dict(end) if end else {'x': spread, 'y': spread, 'z': spread}
	waypoints = [dict(w) for w in waypoints] if waypoints else []
	direct_distance = getDistTwoPoints3D(start, end)

	numIslands = pickIslandCount3D(amountPoints)
	islands = clusterIslands3D(points, numIslands)
	contacts = findContactPoints3D(islands)
	islandGraph = buildIslandGraph(len(islands), contacts)

	legs = [start] + waypoints + [end]
	fullChainPoints = []
	maxHopOverall = 0.0
	allSatisfied = True
	crossedKeysAll = set()
	for i in range(len(legs) - 1):
		a, b = legs[i], legs[i + 1]
		segChain, maxHop, satisfied, crossedKeys = routeBetween3D(points, islands, contacts, islandGraph, a, b, maxHopDistance)
		fullChainPoints.extend(segChain)
		maxHopOverall = max(maxHopOverall, maxHop)
		allSatisfied = allSatisfied and satisfied
		crossedKeysAll |= crossedKeys
		if i < len(legs) - 2:
			marker = dict(b)
			marker['is_stop'] = True
			fullChainPoints.append(marker)

	chain_full = fullChainPoints
	chain_distance = 0.0
	prev = start
	for p in fullChainPoints:
		chain_distance += getDistTwoPoints3D(prev, p)
		prev = p
	chain_distance += getDistTwoPoints3D(prev, end)
	detour_factor = chain_distance / direct_distance if direct_distance else 1.0

	bridgesUsed = [
		{'a': {'x': c['a']['x'], 'y': c['a']['y'], 'z': c['a']['z']}, 'b': {'x': c['b']['x'], 'y': c['b']['y'], 'z': c['b']['z']}}
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
