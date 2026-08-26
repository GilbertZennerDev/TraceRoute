"""
3D generalization of algorithm.py's routing logic.

The original 2D version projects a point onto a line via its slope (a, b) -
that doesn't generalize past 2D (there's no single "slope" in 3D). The
underlying idea generalizes cleanly through vector projection instead:
for a line through `start` with direction d = end - start, any point P
projects onto it at t = dot(P - start, d) / dot(d, d), landing on
start + t*d. t in (0, 1) means "between start and end" - the exact same
role PointIsBetweenStartEnd played in 2D, just expressed with a scalar
instead of comparing x-coordinates. Everything downstream (distance,
corridor filter, even-chain heading score) is dot-product/vector-norm
math that works identically regardless of how many coordinates a point has.
"""

import random as r
from math import sqrt as sqrt
from math import acos as acos


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

def checks3D(amountPoints, startIndex, endIndex):
	error = False
	if amountPoints < 2: error = True
	if startIndex < 0 or startIndex > amountPoints - 1: error = True
	if endIndex < 0 or endIndex > amountPoints - 1: error = True
	if startIndex == endIndex: error = True
	if error: raise ValueError("Bad Args")

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

def runTraceRoute3D(amountPoints, startIndex, endIndex, spread, maxHopDistance=200):
	checks3D(amountPoints, startIndex, endIndex)

	points = genPoints3D(amountPoints, spread)
	start = {'id': 0, 'x': 0, 'y': 0, 'z': 0}
	end = {'id': 1, 'x': spread, 'y': spread, 'z': spread}

	rest = [p for p in points if p['id'] != startIndex and p['id'] != endIndex]
	dist_arr = []
	for p in rest:
		t, proj = projectPointOnLine3D(p, start, end)
		if t <= 0 or t >= 1: continue
		distance = getDistTwoPoints3D(proj, p)
		dist_arr.append({'id': p['id'], 'distance': distance})
	dist_arr_sorted = sorted(dist_arr, key=lambda x: x['distance'])
	corridorIds = [d['id'] for d in dist_arr_sorted]

	direct_distance = getDistTwoPoints3D(start, end)

	best = findChainWithMaxHop3D(corridorIds, points, start, end, maxHopDistance)
	chain_full = [points[cid] for cid in best['chainIds']] if best else []
	chain_distance = best['chain_distance'] if best else direct_distance
	detour_factor = best['detour_factor'] if best else 1.0
	max_hop = best['max_hop'] if best else direct_distance
	satisfied = best['satisfied'] if best else (direct_distance <= maxHopDistance)

	return {
		'points': points,
		'start': start,
		'end': end,
		'closest': chain_full,
		'direct_distance': direct_distance,
		'chain': chain_full,
		'chain_distance': chain_distance,
		'detour_factor': detour_factor,
		'max_hop': max_hop,
		'max_hop_satisfied': satisfied,
	}
