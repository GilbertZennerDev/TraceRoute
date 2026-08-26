const form = document.getElementById("form");
const canvas = document.getElementById("canvas");
// `let`, not `const` - drawOnto() below temporarily repoints this at an
// offscreen context so the same terrain/icon/island helpers can render
// either the visible canvas or the cached static layer.
let ctx = canvas.getContext("2d");
const info = document.getElementById("info");
const clickStatus = document.getElementById("clickStatus");
const stats = document.getElementById("stats");
const submitBtn = form.querySelector("button[type=submit]");
const spreadInput = document.getElementById("spread");

// Lets the user click the map to place origin/destination instead of only
// ever routing between two fixed corners. Stored in world (km) coordinates,
// independent of canvas pixel size, so they survive a resize.
let picked = { start: null, end: null };

function updateClickStatus() {
	if (!picked.start) clickStatus.textContent = "📍 Click the map to set the origin";
	else if (!picked.end) clickStatus.textContent = "🎯 Click again to set the destination";
	else clickStatus.textContent = "✅ Origin & destination set — click to start over, or press Run";
}

function eventToWorld(e, spread) {
	const rect = canvas.getBoundingClientRect();
	const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
	const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
	return { x: (cx / canvas.width) * spread, y: (cy / canvas.height) * spread };
}

function drawPreview() {
	const spread = Number(spreadInput.value) || 500;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	drawTerrain(spread);

	const scaleX = canvas.width / spread, scaleY = canvas.height / spread;
	if (picked.start) drawCityIcon(picked.start.x * scaleX, picked.start.y * scaleY, 16, "#00d9c0");
	if (picked.end) drawCityIcon(picked.end.x * scaleX, picked.end.y * scaleY, 16, "#6c5ce7");
}

function stopFlowAnimation() {
	if (flowAnimId) cancelAnimationFrame(flowAnimId);
	flowAnimId = null;
}

canvas.addEventListener("click", (e) => {
	const spread = Number(spreadInput.value) || 500;
	const world = eventToWorld(e, spread);
	if (!picked.start || picked.end) {
		picked = { start: world, end: null };
	} else {
		picked.end = world;
	}
	stopFlowAnimation();
	updateClickStatus();
	drawPreview();
});

spreadInput.addEventListener("change", () => {
	picked = { start: null, end: null };
	stopFlowAnimation();
	updateClickStatus();
	drawPreview();
});

// Same fractal simplex noise as the 3D terrain (three-demo.js) - reused
// here as a top-down "topo map" background instead of an empty starfield,
// sampled in the SAME (x, y) coordinate space as the points (0..spread)
// so the terrain under a point actually corresponds to that point's
// location, not a decorative unrelated texture.
const terrainNoise = typeof SimplexNoise !== "undefined" ? new SimplexNoise("traceroute-terrain") : null;
function terrainHeight2D(x, y) {
	if (!terrainNoise) return 0;
	let amplitude = 1, frequency = 0.004, sum = 0, norm = 0;
	for (let octave = 0; octave < 4; octave++) {
		sum += terrainNoise.noise2D(x * frequency, y * frequency) * amplitude;
		norm += amplitude;
		amplitude *= 0.5;
		frequency *= 2.1;
	}
	return sum / norm; // -1..1
}
function terrainColor2D(h) {
	const stops = [
		[13, 23, 41], [13, 64, 71], [38, 97, 56],
		[115, 107, 71], [184, 178, 168],
	];
	const t = Math.max(0, Math.min(1, (h + 1) / 2));
	const scaled = t * (stops.length - 1);
	const i = Math.min(stops.length - 2, Math.floor(scaled));
	const f = scaled - i;
	const c = [0, 1, 2].map(k => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f));
	return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function drawTerrain(spread) {
	const cell = 14;
	for (let cy = 0; cy < canvas.height; cy += cell) {
		for (let cx = 0; cx < canvas.width; cx += cell) {
			const wx = (cx / canvas.width) * spread;
			const wy = (cy / canvas.height) * spread;
			ctx.fillStyle = terrainColor2D(terrainHeight2D(wx, wy));
			ctx.fillRect(cx, cy, cell + 1, cell + 1);
		}
	}
	ctx.fillStyle = "rgba(11, 14, 20, 0.35)"; // darken slightly so foreground still pops
	ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Google's Material Symbols "place" glyph (Apache-2.0, free, no attribution
// required) - a single continuous filled teardrop, which stays legible at
// small sizes in a way two separate shapes (a hand-drawn house) didn't.
// 24x24 viewBox; the pin's tip sits at local (12, 22).
const PIN_ICON = new Path2D(
	"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5" +
	"c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
);

function drawCityIcon(x, y, size, color) {
	const scale = size / 22;
	ctx.save();
	ctx.fillStyle = color;
	ctx.translate(x - 12 * scale, y - 22 * scale);
	ctx.scale(scale, scale);
	ctx.fill(PIN_ICON);
	ctx.restore();
}

// Distinct hue per island ("NYC principle": Manhattan/Brooklyn/Queens
// read as different boroughs at a glance) - cycled if there are more
// islands than colors.
const ISLAND_COLORS = ["#8ecae6", "#ffb703", "#fb8500", "#06d6a0", "#c77dff", "#f72585", "#90e0ef", "#e9c46a"];

// Monotone-chain convex hull - turns "a scattered cluster of points" into
// an actual landmass outline to draw, which is what makes islands read
// as islands instead of just differently-colored dots.
function convexHull(pts) {
	if (pts.length < 3) return pts;
	const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower = [];
	for (const p of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const p = sorted[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
		upper.push(p);
	}
	upper.pop();
	lower.pop();
	return lower.concat(upper);
}

// Pushes every hull point outward from the hull's centroid so the drawn
// shore sits a bit past the outermost dots, like real coastline margin.
function inflateHull(hull, padding) {
	const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
	const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
	return hull.map(p => {
		const dx = p.x - cx, dy = p.y - cy;
		const d = Math.sqrt(dx * dx + dy * dy) || 1;
		const scale = (d + padding) / d;
		return { x: cx + dx * scale, y: cy + dy * scale };
	});
}

// Traces the hull through the midpoint of each edge with a quadratic
// curve to each vertex - rounds every corner into a soft coastline
// instead of a sharp, obviously-geometric polygon.
function tracIslandShape(hull) {
	const n = hull.length;
	if (n < 3) return;
	const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
	const start = mid(hull[n - 1], hull[0]);
	ctx.moveTo(start.x, start.y);
	for (let i = 0; i < n; i++) {
		const p = hull[i];
		const next = hull[(i + 1) % n];
		const m = mid(p, next);
		ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
	}
	ctx.closePath();
}

// Deterministic pseudo-random per grid cell (same island always looks the
// same, no flicker on redraw) - a cheap hash, not a real PRNG library.
function cellHash(x, y) {
	const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return s - Math.floor(s);
}

// Procedural top-down "city" texture: a street grid of building blocks,
// found free-image sourcing being fragile for a live site (licensing,
// hotlinking, availability) - this stays self-contained like the rest of
// the site's procedural look (terrain noise, pin icon), just clipped to
// the island's own coastline shape so it only ever fills that island.
function drawCityTexture(hull) {
	const xs = hull.map(p => p.x), ys = hull.map(p => p.y);
	const minX = Math.min(...xs), maxX = Math.max(...xs);
	const minY = Math.min(...ys), maxY = Math.max(...ys);
	const cell = 15;

	ctx.fillStyle = "#1c1f28";
	ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

	for (let y = minY; y < maxY; y += cell) {
		for (let x = minX; x < maxX; x += cell) {
			const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
			const h = cellHash(cx, cy);
			const inset = 1.4 + h * 0.6;
			const shade = 0.12 + h * 0.22;
			ctx.fillStyle = `rgba(255, 255, 255, ${shade})`;
			ctx.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
		}
	}
}

// Static layer (terrain + islands) is expensive to redraw (thousands of
// terrain cells + city texture per island) - rendered once per Run into an
// offscreen canvas, then just blitted every animation frame so the bridge
// "flow" animation stays cheap.
const staticCanvas = document.createElement("canvas");
staticCanvas.width = canvas.width;
staticCanvas.height = canvas.height;
const staticCtx = staticCanvas.getContext("2d");

let flowAnimId = null;
let flowData = null, flowScaleX = 1, flowScaleY = 1;

function drawStaticLayer(data, spread) {
	const scaleX = canvas.width / spread;
	const scaleY = canvas.height / spread;
	const sctx = staticCtx;

	sctx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
	drawOnto(sctx, () => drawTerrain(spread));

	if (data.islands && data.islands.length > 1) {
		data.islands.forEach((ids, islandIdx) => {
			const color = ISLAND_COLORS[islandIdx % ISLAND_COLORS.length];
			const pts = ids.map(pid => data.points[pid]).filter(Boolean)
				.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
			drawOnto(sctx, () => {
				if (pts.length >= 3) {
					const hull = inflateHull(convexHull(pts), 22);

					sctx.save();
					sctx.beginPath();
					tracIslandShape(hull);
					sctx.clip();
					drawCityTexture(hull);
					sctx.restore();

					sctx.beginPath();
					tracIslandShape(hull);
					sctx.fillStyle = color + "2e";
					sctx.fill();
					sctx.strokeStyle = color + "cc";
					sctx.lineWidth = 2.5;
					sctx.stroke();
				}
				for (const pid of ids) {
					const p = data.points[pid];
					if (p) drawCityIcon(p.x * scaleX, p.y * scaleY, 5.5, color);
				}
			});
		});
	} else {
		drawOnto(sctx, () => {
			for (const p of data.points) {
				drawCityIcon(p.x * scaleX, p.y * scaleY, 6, "rgba(255, 255, 255, 0.8)");
			}
		});
	}
}

// drawTerrain/drawCityIcon/drawCityTexture/tracIslandShape all draw through
// the module-level `ctx` - this swaps it to a target context for the
// duration of `fn`, so the same drawing code can target either the visible
// canvas or the offscreen static layer without duplicating every helper.
function drawOnto(target, fn) {
	const prev = ctx;
	ctx = target;
	fn();
	ctx = prev;
}

function draw(data, spread) {
	flowData = data;
	flowScaleX = canvas.width / spread;
	flowScaleY = canvas.height / spread;
	drawStaticLayer(data, spread);
	if (flowAnimId) cancelAnimationFrame(flowAnimId);
	animateFlow();
}

// Renders one frame: the cached static layer, plus the direct line, chain,
// pins, and bridges - the bridges get an animated, marching dash in the
// same yellow as the chain path so island crossings visually read as part
// of the same continuous "flow" instead of a separate disconnected line.
function renderFrame(dashOffset) {
	const data = flowData, scaleX = flowScaleX, scaleY = flowScaleY;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(staticCanvas, 0, 0);

	if (data.bridges) {
		ctx.strokeStyle = "#ffd166";
		ctx.shadowColor = "#ffd166";
		ctx.shadowBlur = 6;
		ctx.lineWidth = 2.5;
		ctx.setLineDash([10, 8]);
		ctx.lineDashOffset = -dashOffset;
		for (const bridge of data.bridges) {
			ctx.beginPath();
			ctx.moveTo(bridge.a.x * scaleX, bridge.a.y * scaleY);
			ctx.lineTo(bridge.b.x * scaleX, bridge.b.y * scaleY);
			ctx.stroke();
		}
		ctx.setLineDash([]);
		ctx.lineDashOffset = 0;
		ctx.shadowBlur = 0;
	}

	ctx.strokeStyle = "rgba(0, 217, 192, 0.35)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(data.start.x * scaleX, data.start.y * scaleY);
	ctx.lineTo(data.end.x * scaleX, data.end.y * scaleY);
	ctx.stroke();

	const chainPoints = [data.start, ...data.chain, data.end];
	ctx.strokeStyle = "#ffd166";
	ctx.shadowColor = "#ffd166";
	ctx.shadowBlur = 5;
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.moveTo(chainPoints[0].x * scaleX, chainPoints[0].y * scaleY);
	for (const p of chainPoints.slice(1)) ctx.lineTo(p.x * scaleX, p.y * scaleY);
	ctx.stroke();
	ctx.shadowBlur = 0;

	ctx.shadowColor = "#ff5f7e";
	ctx.shadowBlur = 12;
	for (const p of data.chain) {
		drawCityIcon(p.x * scaleX, p.y * scaleY, 13, "#ff5f7e");
	}
	ctx.shadowBlur = 0;

	ctx.shadowColor = "#00d9c0";
	ctx.shadowBlur = 10;
	drawCityIcon(data.start.x * scaleX, data.start.y * scaleY, 16, "#00d9c0");
	ctx.shadowBlur = 0;

	ctx.shadowColor = "#6c5ce7";
	ctx.shadowBlur = 10;
	drawCityIcon(data.end.x * scaleX, data.end.y * scaleY, 16, "#6c5ce7");
	ctx.shadowBlur = 0;
}

function animateFlow() {
	let start = null;
	function step(ts) {
		if (start === null) start = ts;
		const dashOffset = ((ts - start) / 1000) * 24; // px/sec, matches the [10,8] dash pattern
		renderFrame(dashOffset);
		flowAnimId = requestAnimationFrame(step);
	}
	flowAnimId = requestAnimationFrame(step);
}

function setLoading(isLoading) {
	submitBtn.classList.toggle("is-loading", isLoading);
	submitBtn.disabled = isLoading;
}

form.addEventListener("submit", async (e) => {
	e.preventDefault();

	const engine = document.getElementById("engine").value;
	const spread = Number(spreadInput.value);
	const paramObj = {
		amountPoints: document.getElementById("amountPoints").value,
		spread: spreadInput.value,
		maxHopDistance: document.getElementById("maxHopDistance").value,
		engine,
	};
	if (picked.start) { paramObj.startX = picked.start.x; paramObj.startY = picked.start.y; }
	if (picked.end) { paramObj.endX = picked.end.x; paramObj.endY = picked.end.y; }
	const params = new URLSearchParams(paramObj);

	setLoading(true);
	info.textContent = "Computing projections…";

	try {
		const started = performance.now();
		const res = await fetch(`/api/traceroute?${params}`);
		if (!res.ok) {
			const err = await res.json();
			throw new Error(err.detail || res.statusText);
		}
		const data = await res.json();
		const elapsed = (performance.now() - started).toFixed(0);

		draw(data, spread);

		stats.hidden = false;
		document.getElementById("statPoints").textContent = data.points.length;
		document.getElementById("statClosest").textContent = data.closest.length;
		document.getElementById("statDistance").textContent = data.direct_distance.toFixed(1);
		document.getElementById("statChain").textContent = data.chain_distance.toFixed(1);
		document.getElementById("statDetour").textContent = `${data.detour_factor.toFixed(2)}×`;
		document.getElementById("statMaxHop").textContent = data.max_hop.toFixed(1);
		document.getElementById("statIslands").textContent = data.bridges ? data.bridges.length + 1 : 1;

		const detourGood = data.detour_factor < 1.1;
		const engineTag = data.engine === "cpp"
			? `<span style="color:#8b7cf6">⚙️ C++</span>`
			: `<span style="color:#00d9c0">🐍 Python</span>`;
		info.innerHTML = `${engineTag} solved in <strong>${elapsed}ms</strong> &nbsp;·&nbsp; `
			+ `<span style="color:#00d9c0">✈️ direct ${data.direct_distance.toFixed(1)}</span> &nbsp;·&nbsp; `
			+ `<span style="color:#ffd166">🛣️ chain ${data.chain_distance.toFixed(1)}</span> `
			+ `<span style="color:${detourGood ? '#7ee787' : '#ff5f7e'}">(${data.detour_factor.toFixed(2)}× ${detourGood ? '🎯' : '⚠️'})</span>`;
	} catch (err) {
		info.textContent = `Error: ${err.message}`;
	} finally {
		setLoading(false);
	}
});

updateClickStatus();
form.dispatchEvent(new Event("submit"));
