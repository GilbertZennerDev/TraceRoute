// Compiled routing core, exposed through a plain C ABI so it can be loaded
// from Python via ctypes without needing pybind11/Boost as a build
// dependency. Logic mirrors app/algorithm.py 1:1, including the
// hierarchical "NYC principle" island routing (see the comment block
// above the island functions in algorithm.py for the full rationale) -
// this used to be a flat single-corridor engine; it now matches the
// Python engine's routing behavior, just compiled.
//
// Build: g++ -std=c++17 -O2 -shared -fPIC traceroute_core.cpp -o libtraceroute.so

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <numeric>
#include <queue>
#include <random>
#include <set>
#include <utility>
#include <vector>

using namespace std;

struct Point { double x, y; };

static double dist(const Point &a, const Point &b)
{
	return sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

// Filters candidateIds down to the ones whose orthogonal projection onto
// the start->end line actually falls between them - same filter as
// buildCorridorIds() in algorithm.py, just scoped to whatever id subset is
// passed in (the whole map, or a single island's points).
static vector<int> corridorFilter(const vector<Point> &points, const vector<int> &candidateIds,\
const Point &start, const Point &end)
{
	double a = (end.y - start.y) / (end.x - start.x);
	double b = start.y - a * start.x;
	double xs = start.x, xe = end.x;
	if (xs > xe) swap(xs, xe);

	vector<int> ids;
	ids.reserve(candidateIds.size());
	for (int id : candidateIds)
	{
		double a_o = (a == 0) ? -1 / 0.001 : -1 / a;
		double b_o = points[id].y - a_o * points[id].x;
		double div = (a - a_o);
		if (div == 0) div = 0.001;
		double x_inter = (b_o - b) / div;
		if (x_inter > xs && x_inter < xe) ids.push_back(id);
	}
	return ids;
}

static vector<int> buildEvenChain(const vector<int> &candidateIds, const vector<Point> &points,\
const Point &start, const Point &end, int amount)
{
	vector<int> remaining = candidateIds;
	double target = dist(start, end) / (amount + 1);
	Point current = start;
	vector<int> pathIds;

	for (int k = 0; k < amount && !remaining.empty(); ++k)
	{
		double distToEndNow = dist(current, end);
		vector<int> forward;
		for (int id : remaining) if (dist(points[id], end) < distToEndNow) forward.push_back(id);
		vector<int> &pool = forward.empty() ? remaining : forward;

		double d1x = end.x - current.x, d1y = end.y - current.y;
		double mag1 = sqrt(d1x * d1x + d1y * d1y);

		int bestId = -1;
		double bestScore = numeric_limits<double>::max();
		for (int id : pool)
		{
			double d2x = points[id].x - current.x, d2y = points[id].y - current.y;
			double mag2 = sqrt(d2x * d2x + d2y * d2y);
			if (mag1 == 0 || mag2 == 0) continue;
			double cosA = max(-1.0, min(1.0, (d1x * d2x + d1y * d2y) / (mag1 * mag2)));
			double heading = acos(cosA);
			double hopDiff = target ? fabs(mag2 - target) / target : 0;
			double score = heading + 0.4 * hopDiff;
			if (score <= bestScore) { bestScore = score; bestId = id; }
		}
		if (bestId == -1) bestId = pool[0];

		pathIds.push_back(bestId);
		current = points[bestId];
		remaining.erase(remove(remaining.begin(), remaining.end(), bestId), remaining.end());
	}
	return pathIds;
}

static double chainDistance(const vector<int> &pathIds, const vector<Point> &points, const Point &start, const Point &end)
{
	double total = 0;
	Point prev = start;
	for (int id : pathIds) { total += dist(prev, points[id]); prev = points[id]; }
	total += dist(prev, end);
	return total;
}

static double maxHopLength(const vector<int> &chainIds, const vector<Point> &points, const Point &start, const Point &end)
{
	vector<Point> hops;
	hops.push_back(start);
	for (int id : chainIds) hops.push_back(points[id]);
	hops.push_back(end);
	double m = 0;
	for (size_t i = 0; i + 1 < hops.size(); ++i) m = max(m, dist(hops[i], hops[i + 1]));
	return m;
}

// The caller doesn't pick a waypoint count - they pick the thing that
// actually matters (a max distance between consecutive stops, e.g. a
// truck's fuel range). Tries chain lengths from 0 up and returns the
// FIRST (shortest/straightest) one where every hop is within
// maxHopDistance. Mirrors findChainWithMaxHop in algorithm.py.
struct ChainSearch { vector<int> chainIds; double maxHop; bool satisfied; };

static ChainSearch findChainWithMaxHop(const vector<int> &candidateIds, const vector<Point> &points,\
const Point &start, const Point &end, double maxHopDistance, int amountCap = 60)
{
	double directDistance = dist(start, end);
	int needed = maxHopDistance > 0 ? (int) (directDistance / maxHopDistance) + 2 : amountCap;
	int maxAmount = min({(int) candidateIds.size(), amountCap, max(needed, 1)});

	ChainSearch bestFallback{{}, numeric_limits<double>::max(), false};
	for (int amount = 0; amount <= maxAmount; ++amount)
	{
		vector<int> chain = amount > 0 ? buildEvenChain(candidateIds, points, start, end, amount) : vector<int>{};
		double mh = maxHopLength(chain, points, start, end);
		if (mh <= maxHopDistance) return {chain, mh, true};
		if (mh < bestFallback.maxHop) bestFallback = {chain, mh, false};
	}
	return bestFallback;
}

// --- "NYC principle": islands connected by single bridge points --------
// Ports the same hierarchical routing algorithm.py uses by default: cluster
// into dense islands, connect neighboring islands by exactly the closest
// point-pair between them, and only ever run the corridor+chain algorithm
// above INSIDE one island at a time. See algorithm.py for the full
// rationale - this is a 1:1 port, not a separate approach.

static int pickIslandCount(int amountPoints)
{
	if (amountPoints < 20) return 1;
	int k = (int) llround(sqrt((double) amountPoints) / 4.0);
	return max(2, min(8, k));
}

static vector<vector<int>> clusterIslands(const vector<Point> &points, int k, mt19937 &rng, int iterations = 15)
{
	int n = (int) points.size();
	if (k <= 1 || n <= k)
	{
		vector<int> all(n);
		iota(all.begin(), all.end(), 0);
		return { all };
	}

	vector<int> idx(n);
	iota(idx.begin(), idx.end(), 0);
	shuffle(idx.begin(), idx.end(), rng);
	vector<Point> centers(k);
	for (int c = 0; c < k; ++c) centers[c] = points[idx[c]];

	vector<int> assignment(n, 0);
	for (int it = 0; it < iterations; ++it)
	{
		for (int i = 0; i < n; ++i)
		{
			int best = 0; double bestD = numeric_limits<double>::max();
			for (int c = 0; c < k; ++c)
			{
				double d = dist(points[i], centers[c]);
				if (d < bestD) { bestD = d; best = c; }
			}
			assignment[i] = best;
		}
		vector<Point> sum(k, {0, 0});
		vector<int> cnt(k, 0);
		for (int i = 0; i < n; ++i) { sum[assignment[i]].x += points[i].x; sum[assignment[i]].y += points[i].y; cnt[assignment[i]]++; }
		for (int c = 0; c < k; ++c) if (cnt[c] > 0) centers[c] = {sum[c].x / cnt[c], sum[c].y / cnt[c]};
	}

	vector<vector<int>> raw(k);
	for (int i = 0; i < n; ++i) raw[assignment[i]].push_back(i);
	vector<vector<int>> islands;
	for (auto &isl : raw) if (!isl.empty()) islands.push_back(move(isl));
	return islands;
}

struct Contact { int aIdx, bIdx; double distance; };

// For every pair of islands, the single closest point pair becomes their
// one bridge. Each island's search is capped to a random sample (sampleCap)
// so this stays fast with large islands.
static map<pair<int, int>, Contact> findContactPoints(const vector<vector<int>> &islands,\
const vector<Point> &points, mt19937 &rng, int sampleCap = 150)
{
	int k = (int) islands.size();
	vector<vector<int>> samples(k);
	for (int i = 0; i < k; ++i)
	{
		samples[i] = islands[i];
		if ((int) samples[i].size() > sampleCap)
		{
			shuffle(samples[i].begin(), samples[i].end(), rng);
			samples[i].resize(sampleCap);
		}
	}

	map<pair<int, int>, Contact> contacts;
	for (int i = 0; i < k; ++i)
	{
		for (int j = i + 1; j < k; ++j)
		{
			if (samples[i].empty() || samples[j].empty()) continue;
			double bestDist = numeric_limits<double>::max();
			int bestA = -1, bestB = -1;
			for (int a : samples[i])
				for (int b : samples[j])
				{
					double d = dist(points[a], points[b]);
					if (d < bestDist) { bestDist = d; bestA = a; bestB = b; }
				}
			if (bestA != -1) contacts[{i, j}] = {bestA, bestB, bestDist};
		}
	}
	return contacts;
}

static vector<vector<pair<int, double>>> buildIslandGraph(int k, const map<pair<int, int>, Contact> &contacts)
{
	vector<vector<pair<int, double>>> adj(k);
	for (auto &kv : contacts)
	{
		int i = kv.first.first, j = kv.first.second;
		adj[i].push_back({j, kv.second.distance});
		adj[j].push_back({i, kv.second.distance});
	}
	return adj;
}

static vector<int> dijkstraIslands(const vector<vector<pair<int, double>>> &adj, int startIsland, int endIsland)
{
	int k = (int) adj.size();
	vector<double> distArr(k, numeric_limits<double>::max());
	vector<int> prev(k, -1);
	vector<bool> visited(k, false);
	distArr[startIsland] = 0;
	priority_queue<pair<double, int>, vector<pair<double, int>>, greater<>> pq;
	pq.push({0, startIsland});
	while (!pq.empty())
	{
		auto top = pq.top(); pq.pop();
		double d = top.first; int u = top.second;
		if (visited[u]) continue;
		visited[u] = true;
		if (u == endIsland) break;
		for (auto &edge : adj[u])
		{
			int v = edge.first; double w = edge.second;
			double nd = d + w;
			if (nd < distArr[v]) { distArr[v] = nd; prev[v] = u; pq.push({nd, v}); }
		}
	}
	if (distArr[endIsland] == numeric_limits<double>::max()) return {};
	vector<int> path; int cur = endIsland;
	while (cur != startIsland) { path.push_back(cur); cur = prev[cur]; }
	path.push_back(startIsland);
	reverse(path.begin(), path.end());
	return path;
}

static Point islandCentroid(const vector<int> &island, const vector<Point> &points)
{
	double sx = 0, sy = 0;
	for (int id : island) { sx += points[id].x; sy += points[id].y; }
	int n = (int) island.size();
	return {sx / n, sy / n};
}

static int nearestIslandIndex(const vector<vector<int>> &islands, const vector<Point> &points, const Point &p)
{
	int best = 0; double bestD = numeric_limits<double>::max();
	for (int i = 0; i < (int) islands.size(); ++i)
	{
		double d = dist(p, islandCentroid(islands[i], points));
		if (d < bestD) { bestD = d; best = i; }
	}
	return best;
}

extern "C"
{

struct TraceRouteResult
{
	int point_count;
	double *points_x;
	double *points_y;
	double start_x, start_y;
	double end_x, end_y;
	int chain_count;
	double *chain_x;
	double *chain_y;
	double direct_distance;
	double chain_distance;
	double detour_factor;
	double max_hop;
	int max_hop_satisfied;

	int island_count;
	int *island_offsets;   // length island_count + 1 (CSR-style row pointers)
	int *island_point_ids; // length island_offsets[island_count]

	int bridge_count;
	double *bridge_ax;
	double *bridge_ay;
	double *bridge_bx;
	double *bridge_by;
};

__attribute__((visibility("default")))
TraceRouteResult *run_traceroute(int amountPoints, int spread, double maxHopDistance,\
double startX, double startY, double endX, double endY)
{
	random_device rd;
	mt19937 rng(rd());
	uniform_real_distribution<double> d(0, spread);

	vector<Point> points(amountPoints);
	for (int i = 0; i < amountPoints; ++i) points[i] = {d(rng), d(rng)};

	Point start{startX, startY}, end{endX, endY};
	double directDistance = dist(start, end);

	int numIslands = pickIslandCount(amountPoints);
	vector<vector<int>> islands = clusterIslands(points, numIslands, rng);
	map<pair<int, int>, Contact> contacts = findContactPoints(islands, points, rng);
	vector<vector<pair<int, double>>> islandGraph = buildIslandGraph((int) islands.size(), contacts);

	int startIsland = nearestIslandIndex(islands, points, start);
	int endIsland = nearestIslandIndex(islands, points, end);
	vector<int> islandPath;
	if (startIsland == endIsland) islandPath = {startIsland};
	else
	{
		islandPath = dijkstraIslands(islandGraph, startIsland, endIsland);
		if (islandPath.empty()) islandPath = {startIsland, endIsland}; // disconnected: best-effort straight hop
	}

	vector<int> fullChainIds;
	Point current = start;
	double maxHopOverall = 0.0;
	bool allSatisfied = true;

	for (size_t idx = 0; idx < islandPath.size(); ++idx)
	{
		int islandIdx = islandPath[idx];
		bool crossing = idx + 1 < islandPath.size();
		Point exitPoint;
		int myPointId = -1, theirPointId = -1;

		if (crossing)
		{
			int nextIsland = islandPath[idx + 1];
			pair<int, int> key = islandIdx < nextIsland ? make_pair(islandIdx, nextIsland) : make_pair(nextIsland, islandIdx);
			auto it = contacts.find(key);
			if (it != contacts.end())
			{
				// 'aIdx' always belongs to the lower-indexed island of the
				// pair, 'bIdx' to the higher one - pick whichever side is
				// actually on the CURRENT island as the exit point, so both
				// sides of the bridge end up in the chain (see
				// algorithm.py's runTraceRoute for the same fix).
				if (islandIdx < nextIsland) { myPointId = it->second.aIdx; theirPointId = it->second.bIdx; }
				else { myPointId = it->second.bIdx; theirPointId = it->second.aIdx; }
				exitPoint = points[myPointId];
			}
			else exitPoint = end;
		}
		else exitPoint = end;

		vector<int> corridorIds = corridorFilter(points, islands[islandIdx], current, exitPoint);
		ChainSearch best = findChainWithMaxHop(corridorIds, points, current, exitPoint, maxHopDistance);
		for (int id : best.chainIds) fullChainIds.push_back(id);
		maxHopOverall = max(maxHopOverall, best.maxHop);
		allSatisfied = allSatisfied && best.satisfied;

		if (crossing && myPointId != -1)
		{
			fullChainIds.push_back(myPointId);
			if (theirPointId != myPointId) fullChainIds.push_back(theirPointId);
			current = points[theirPointId];
		}
		else current = exitPoint;
	}

	double total = chainDistance(fullChainIds, points, start, end);

	set<pair<int, int>> crossedKeys;
	for (size_t t = 0; t + 1 < islandPath.size(); ++t)
	{
		int i = islandPath[t], j = islandPath[t + 1];
		crossedKeys.insert(i < j ? make_pair(i, j) : make_pair(j, i));
	}
	vector<Contact> bridgesUsed;
	for (auto &kv : contacts) if (crossedKeys.count(kv.first)) bridgesUsed.push_back(kv.second);

	TraceRouteResult *res = new TraceRouteResult();
	res->point_count = amountPoints;
	res->points_x = new double[amountPoints];
	res->points_y = new double[amountPoints];
	for (int i = 0; i < amountPoints; ++i) { res->points_x[i] = points[i].x; res->points_y[i] = points[i].y; }

	res->start_x = start.x; res->start_y = start.y;
	res->end_x = end.x; res->end_y = end.y;

	res->chain_count = (int) fullChainIds.size();
	res->chain_x = new double[fullChainIds.size()];
	res->chain_y = new double[fullChainIds.size()];
	for (size_t i = 0; i < fullChainIds.size(); ++i) { res->chain_x[i] = points[fullChainIds[i]].x; res->chain_y[i] = points[fullChainIds[i]].y; }

	res->direct_distance = directDistance;
	res->chain_distance = total;
	res->detour_factor = directDistance ? total / directDistance : 0;
	res->max_hop = maxHopOverall;
	res->max_hop_satisfied = allSatisfied ? 1 : 0;

	res->island_count = (int) islands.size();
	res->island_offsets = new int[islands.size() + 1];
	int totalIslandIds = 0;
	for (auto &isl : islands) totalIslandIds += (int) isl.size();
	res->island_point_ids = new int[totalIslandIds];
	{
		int offset = 0;
		for (size_t i = 0; i < islands.size(); ++i)
		{
			res->island_offsets[i] = offset;
			for (int id : islands[i]) res->island_point_ids[offset++] = id;
		}
		res->island_offsets[islands.size()] = offset;
	}

	res->bridge_count = (int) bridgesUsed.size();
	res->bridge_ax = new double[bridgesUsed.size()];
	res->bridge_ay = new double[bridgesUsed.size()];
	res->bridge_bx = new double[bridgesUsed.size()];
	res->bridge_by = new double[bridgesUsed.size()];
	for (size_t i = 0; i < bridgesUsed.size(); ++i)
	{
		res->bridge_ax[i] = points[bridgesUsed[i].aIdx].x;
		res->bridge_ay[i] = points[bridgesUsed[i].aIdx].y;
		res->bridge_bx[i] = points[bridgesUsed[i].bIdx].x;
		res->bridge_by[i] = points[bridgesUsed[i].bIdx].y;
	}

	return res;
}

__attribute__((visibility("default")))
void free_traceroute_result(TraceRouteResult *res)
{
	if (!res) return;
	delete[] res->points_x;
	delete[] res->points_y;
	delete[] res->chain_x;
	delete[] res->chain_y;
	delete[] res->island_offsets;
	delete[] res->island_point_ids;
	delete[] res->bridge_ax;
	delete[] res->bridge_ay;
	delete[] res->bridge_bx;
	delete[] res->bridge_by;
	delete res;
}

} // extern "C"
