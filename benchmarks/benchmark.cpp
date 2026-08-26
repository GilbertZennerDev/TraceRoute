// Real, measured comparison of TraceRoute's C++ core against a real
// Dijkstra implementation, both compiled with -O2. This exists because the
// Python benchmark (benchmark.py) showed TraceRoute losing badly to naive
// Dijkstra there - almost entirely due to CPython's per-call/per-object
// overhead, not the algorithm itself. This isolates the algorithm from
// that interpreter overhead by comparing compiled code to compiled code,
// which is also the fairer test for the embedded/low-power target this
// project argues for (C++ is the target profile, not Python - see
// cpp/main.cpp and the site's "Built for constrained hardware" section).
//
// Fairness notes (same as benchmark.py):
//   - Dijkstra runs on a k-NN graph built from the SAME point cloud.
//     Graph construction is excluded from Dijkstra's timed portion - it
//     represents already-loaded map data, not query time.
//   - This is naive Dijkstra with a binary heap (std::priority_queue) -
//     no Contraction Hierarchies/ALT/precomputation. See benchmark.py's
//     docstring for why that comparison is (and isn't) fair.
//   - Runs on a development machine, not embedded target hardware.
//     Measures wall-clock time only, not real energy draw.
//
// Build:  g++ -std=c++17 -O2 benchmark.cpp -o benchmark
// Run:    ./benchmark

#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <limits>
#include <queue>
#include <random>
#include <vector>

using namespace std;

struct Point { double x, y; };

double dist(const Point &a, const Point &b)
{
	return sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
}

// points[0] and points[1] are fixed at opposite corners - both algorithms
// then solve the exact same origin -> destination query over the exact
// same point cloud, matching the start/end convention the rest of this
// project uses (see cpp/main.cpp, webapp/app/algorithm.py).
vector<Point> genPoints(int n, int spread, mt19937 &rng)
{
	uniform_real_distribution<double> d(0, spread);
	vector<Point> pts(n);
	pts[0] = {0, 0};
	pts[1] = {(double) spread, (double) spread};
	for (int i = 2; i < n; ++i) pts[i] = {d(rng), d(rng)};
	return pts;
}

// Mirrors cpp/main.cpp's corridor filter + buildEvenChain, minus file I/O
// and console logging - the actual routing work TraceRoute does per query.
double runTraceRouteCore(const vector<Point> &points, const Point &start, const Point &end, int amount, vector<int> &pathIds)
{
	double a = (end.y - start.y) / (end.x - start.x);
	double b = start.y - a * start.x;

	vector<int> corridorIds;
	corridorIds.reserve(points.size());
	double xs = start.x, xe = end.x;
	if (xs > xe) swap(xs, xe);

	for (size_t i = 0; i < points.size(); ++i)
	{
		if (i == 0 || i == 1) continue; // skip start/end themselves
		double a_o = (a == 0) ? -1 / 0.001 : -1 / a;
		double b_o = points[i].y - a_o * points[i].x;
		double div = (a - a_o);
		if (div == 0) div = 0.001;
		double x_inter = (b_o - b) / div;
		if (x_inter > xs && x_inter < xe) corridorIds.push_back((int) i);
	}

	vector<int> remaining = corridorIds;
	double target = dist(start, end) / (amount + 1);
	Point current = start;
	pathIds.clear();

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

	double total = 0;
	Point prev = start;
	for (int id : pathIds) { total += dist(prev, points[id]); prev = points[id]; }
	total += dist(prev, end);
	return total;
}

// Excluded from timing on purpose - see the fairness note at the top.
vector<vector<pair<int, double>>> buildKnn(const vector<Point> &points, int k)
{
	int n = (int) points.size();
	vector<vector<pair<int, double>>> adj(n);
	for (int i = 0; i < n; ++i)
	{
		vector<pair<double, int>> d;
		d.reserve(n);
		for (int j = 0; j < n; ++j) if (j != i) d.push_back({dist(points[i], points[j]), j});
		int kk = min(k, (int) d.size());
		partial_sort(d.begin(), d.begin() + kk, d.end());
		for (int t = 0; t < kk; ++t)
		{
			adj[i].push_back({d[t].second, d[t].first});
			adj[d[t].second].push_back({i, d[t].first});
		}
	}
	return adj;
}

double dijkstra(const vector<vector<pair<int, double>>> &adj, int start, int end, int n)
{
	vector<double> distArr(n, numeric_limits<double>::infinity());
	vector<bool> visited(n, false);
	priority_queue<pair<double, int>, vector<pair<double, int>>, greater<>> pq;
	distArr[start] = 0;
	pq.push({0, start});
	while (!pq.empty())
	{
		auto [d, u] = pq.top();
		pq.pop();
		if (visited[u]) continue;
		visited[u] = true;
		if (u == end) break;
		for (auto &[v, w] : adj[u])
		{
			if (distArr[u] + w < distArr[v])
			{
				distArr[v] = distArr[u] + w;
				pq.push({distArr[v], v});
			}
		}
	}
	return distArr[end];
}

int main()
{
	vector<int> sizes = {100, 500, 1000, 2500, 5000, 10000, 50000};
	mt19937 rng(42);

	cout << "n,traceroute_ms,dijkstra_ms,speedup\n";
	for (int n : sizes)
	{
		auto points = genPoints(n, 1000, rng);
		Point start = points[0], end = points[1];
		int amount = 8;

		vector<int> pathIds;
		auto t0 = chrono::high_resolution_clock::now();
		runTraceRouteCore(points, start, end, amount, pathIds);
		auto t1 = chrono::high_resolution_clock::now();
		double tr_ms = chrono::duration<double, milli>(t1 - t0).count();

		auto adj = buildKnn(points, 6);

		auto t2 = chrono::high_resolution_clock::now();
		dijkstra(adj, 0, 1, n);
		auto t3 = chrono::high_resolution_clock::now();
		double dij_ms = chrono::duration<double, milli>(t3 - t2).count();

		cout << n << "," << tr_ms << "," << dij_ms << "," << (tr_ms > 0 ? dij_ms / tr_ms : 0) << "\n";
	}
	return 0;
}
