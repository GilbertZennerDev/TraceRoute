// Compiled routing core, exposed through a plain C ABI so it can be loaded
// from Python via ctypes without needing pybind11/Boost as a build
// dependency. Logic mirrors cpp/main.cpp and benchmarks/benchmark.cpp
// (corridor filter + heading/even-hop greedy chain) - this is the same
// algorithm, just packaged as a library instead of a CLI tool.
//
// Build: g++ -std=c++17 -O2 -shared -fPIC traceroute_core.cpp -o libtraceroute.so

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <random>
#include <vector>

using namespace std;

struct Point { double x, y; };

static double dist(const Point &a, const Point &b)
{
	return sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

static vector<int> corridorFilter(const vector<Point> &points, const Point &start, const Point &end)
{
	double a = (end.y - start.y) / (end.x - start.x);
	double b = start.y - a * start.x;
	double xs = start.x, xe = end.x;
	if (xs > xe) swap(xs, xe);

	vector<int> ids;
	ids.reserve(points.size());
	for (size_t i = 0; i < points.size(); ++i)
	{
		double a_o = (a == 0) ? -1 / 0.001 : -1 / a;
		double b_o = points[i].y - a_o * points[i].x;
		double div = (a - a_o);
		if (div == 0) div = 0.001;
		double x_inter = (b_o - b) / div;
		if (x_inter > xs && x_inter < xe) ids.push_back((int) i);
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
//
// Search width scales with how many stops a tight maxHopDistance could
// plausibly need (directDistance / maxHopDistance) instead of a fixed
// guess - a fixed cap silently gives up as soon as a request needs more
// stops than that. If nothing satisfies the constraint even within that
// width, the BEST attempt (smallest max hop seen across every amount
// tried, not just the last) is returned instead of whatever the final,
// most-constrained attempt happened to produce.
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

	vector<int> corridorIds = corridorFilter(points, start, end);
	ChainSearch search = findChainWithMaxHop(corridorIds, points, start, end, maxHopDistance);
	vector<int> &chainIds = search.chainIds;

	double total = chainDistance(chainIds, points, start, end);
	double directDistance = dist(start, end);

	TraceRouteResult *res = new TraceRouteResult();
	res->point_count = amountPoints;
	res->points_x = new double[amountPoints];
	res->points_y = new double[amountPoints];
	for (int i = 0; i < amountPoints; ++i) { res->points_x[i] = points[i].x; res->points_y[i] = points[i].y; }

	res->start_x = start.x; res->start_y = start.y;
	res->end_x = end.x; res->end_y = end.y;

	res->chain_count = (int) chainIds.size();
	res->chain_x = new double[chainIds.size()];
	res->chain_y = new double[chainIds.size()];
	for (size_t i = 0; i < chainIds.size(); ++i) { res->chain_x[i] = points[chainIds[i]].x; res->chain_y[i] = points[chainIds[i]].y; }

	res->direct_distance = directDistance;
	res->chain_distance = total;
	res->detour_factor = directDistance ? total / directDistance : 0;
	res->max_hop = search.maxHop;
	res->max_hop_satisfied = search.satisfied ? 1 : 0;

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
	delete res;
}

} // extern "C"
