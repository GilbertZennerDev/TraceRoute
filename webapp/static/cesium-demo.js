(() => {
	const container = document.getElementById("cesium-container");
	const form3d = document.getElementById("form3d");
	const info3d = document.getElementById("info3d");
	const clickStatus3d = document.getElementById("clickStatus3d");
	const stats3d = document.getElementById("stats3d");
	const undoBtn3d = document.getElementById("undoPoint3d");
	const spreadInput3d = document.getElementById("spread3d");
	const engineSelect3d = document.getElementById("engine3d");
	if (!container || !form3d || typeof Cesium === "undefined") return;

	const SPREAD_REF = 500;
	const ISLAND_COLORS = [0x8ecae6, 0xffb703, 0xfb8500, 0x06d6a0, 0xc77dff, 0xf72585, 0x90e0ef, 0xe9c46a];

	// Fixed local coordinate anchor ("Null Island", 0,0 - open ocean, chosen
	// purely as an arbitrary frame origin since the real globe is never
	// shown, see initScene). Every algorithm coordinate (x=East, y=North,
	// z=routing-only, not used for placement - same as the Three.js demo)
	// is mapped into world space through this ONE fixed local East-North-Up
	// frame, so the whole invented map always renders at the same place
	// regardless of `spread`.
	const ORIGIN = Cesium.Cartesian3.fromDegrees(0, 0, 0);
	const ENU = Cesium.Transforms.eastNorthUpToFixedFrame(ORIGIN);
	const ENU_INVERSE = Cesium.Matrix4.inverse(ENU, new Cesium.Matrix4());

	function localToWorld(x, y, z) {
		return Cesium.Matrix4.multiplyByPoint(ENU, new Cesium.Cartesian3(x, y, z), new Cesium.Cartesian3());
	}
	function worldToLocal(cartesian) {
		return Cesium.Matrix4.multiplyByPoint(ENU_INVERSE, cartesian, new Cesium.Cartesian3());
	}

	// Same fractal simplex noise as the Three.js demo and the 2D map
	// (script.js) - identical math, just targeting a different renderer.
	const simplex = new SimplexNoise("traceroute-terrain");
	function terrainHeight(x, y) {
		let amplitude = 1, frequency = 0.004, sum = 0, norm = 0;
		for (let octave = 0; octave < 4; octave++) {
			sum += simplex.noise2D(x * frequency, y * frequency) * amplitude;
			norm += amplitude;
			amplitude *= 0.5;
			frequency *= 2.1;
		}
		return (sum / norm) * (SPREAD_REF * 0.09);
	}

	// Cesium's per-instance-color appearance colors a whole geometry
	// instance in one flat color - there's no off-the-shelf equivalent to
	// Three.js's smooth per-vertex vertexColors material without hand
	// writing GLSL. Instead, the terrain is split into a handful of
	// elevation BANDS (same color stops as the other two demos), each band
	// built as its own geometry instance - visually this reads as a
	// stepped/banded low-poly terrain, in the same spirit as the flat-
	// shaded look the Three.js demo already has.
	const HEIGHT_BANDS = [
		[0.00, 0x050a1a], [0.22, 0x0f3d4a], [0.42, 0x266138],
		[0.62, 0x6b6847], [0.80, 0x8c8a7a], [1.00, 0xe0e2ea],
	];
	function bandColor(t) {
		for (let i = HEIGHT_BANDS.length - 1; i >= 0; i--) {
			if (t >= HEIGHT_BANDS[i][0]) return HEIGHT_BANDS[i][1];
		}
		return HEIGHT_BANDS[0][1];
	}

	// Monotone-chain convex hull + point-in-polygon, duplicated from
	// three-demo.js/script.js - each demo file is a standalone IIFE with no
	// shared module system to import this from.
	function convexHull2D(pts) {
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
	function pointInPolygon(poly, x, y) {
		let inside = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
			const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
			if (intersect) inside = !inside;
		}
		return inside;
	}

	let viewer = null;
	let terrainPrimitive = null, waterPrimitive = null, buildingsPrimitive = null;
	let routePrimitive = null, flowEntity = null;
	let markerEntities = [];
	let previewEntities = [];
	let routeSpline = null, flowStartTime = 0;
	const FLOW_DURATION_MS = 4500;

	let picked3d = { start: null, waypoints: [], end: null };

	function updateClickStatus3d() {
		if (!picked3d.start) {
			clickStatus3d.textContent = "📍 Click the terrain to set the origin";
		} else if (!picked3d.end) {
			const n = picked3d.waypoints.length;
			clickStatus3d.textContent = n
				? `🚩 ${n} mandatory stop${n > 1 ? "s" : ""} added — Shift+click to add more, click to set the destination`
				: "🎯 Click to set the destination — or Shift+click to add a mandatory stop first";
		} else {
			clickStatus3d.textContent = "✅ Route set — click to start over";
		}
	}

	function isActive() {
		return engineSelect3d && engineSelect3d.value === "cesium";
	}

	function initViewer() {
		Cesium.Ion.defaultAccessToken = undefined;

		viewer = new Cesium.Viewer(container, {
			baseLayerPicker: false, timeline: false, animation: false, geocoder: false,
			sceneModePicker: false, navigationHelpButton: false, homeButton: false,
			fullscreenButton: false, infoBox: false, selectionIndicator: false,
			imageryProvider: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(),
			shadows: true,
		});
		viewer.scene.globe.show = false;
		viewer.scene.skyAtmosphere.show = false;
		viewer.scene.skyBox.show = false;
		viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#04050a");
		viewer.scene.sun.show = false;
		viewer.scene.moon.show = false;
		viewer.scene.fog.enabled = false;
		viewer.clock.shouldAnimate = true;

		viewer.scene.light = new Cesium.DirectionalLight({
			direction: Cesium.Cartesian3.normalize(new Cesium.Cartesian3(-0.4, -0.6, -0.7), new Cesium.Cartesian3()),
			intensity: 2.2,
		});

		const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
		handler.setInputAction((movement) => handlePick3d(movement.position, false), Cesium.ScreenSpaceEventType.LEFT_CLICK);
		handler.setInputAction((movement) => handlePick3d(movement.position, true), Cesium.ScreenSpaceEventType.LEFT_CLICK, Cesium.KeyboardEventModifier.SHIFT);

		viewer.scene.preUpdate.addEventListener(() => {
			if (routeSpline && flowEntity) {
				const t = ((performance.now() - flowStartTime) % FLOW_DURATION_MS) / FLOW_DURATION_MS;
				flowEntity.position = routeSpline.evaluate(t);
			}
		});
	}

	function clearPrimitive(ref) {
		if (ref && viewer) viewer.scene.primitives.remove(ref);
	}

	function clearEntities(list) {
		if (!viewer) return;
		for (const e of list) viewer.entities.remove(e);
		list.length = 0;
	}

	// Inverts the world click into local (east, north) algorithm-space
	// coordinates by ray-casting the camera through the click point and
	// intersecting with whatever's actually rendered there (our terrain
	// primitive), the Cesium equivalent of Three.js's raycaster-against-
	// mesh approach.
	function pickTerrainXY(windowPosition) {
		if (!viewer || !viewer.scene.pickPositionSupported) return null;
		const cartesian = viewer.scene.pickPosition(windowPosition);
		if (!cartesian) return null;
		const local = worldToLocal(cartesian);
		return { x: local.x, y: local.y };
	}

	function handlePick3d(windowPosition, shiftHeld) {
		const spread = Number(spreadInput3d.value) || 500;
		const xy = pickTerrainXY(windowPosition);
		if (!xy) return;
		const point = { x: xy.x, y: xy.y, z: spread / 2 };

		if (!picked3d.start || picked3d.end) {
			picked3d = { start: point, waypoints: [], end: null };
		} else if (shiftHeld) {
			picked3d.waypoints.push(point);
		} else {
			picked3d.end = point;
		}
		updateClickStatus3d();
		drawPreview3d();
	}

	function undoLastPoint3d() {
		if (picked3d.end) picked3d.end = null;
		else if (picked3d.waypoints.length) picked3d.waypoints.pop();
		else if (picked3d.start) picked3d.start = null;
		updateClickStatus3d();
		drawPreview3d();
	}

	function drawPreview3d() {
		if (!viewer) return;
		clearEntities(previewEntities);
		const addMarker = (p, color, radius) => {
			const e = viewer.entities.add({
				position: localToWorld(p.x, p.y, terrainHeight(p.x, p.y) + 1.5),
				ellipsoid: { radii: new Cesium.Cartesian3(radius, radius, radius), material: Cesium.Color.fromCssColorString(color) },
			});
			previewEntities.push(e);
		};
		if (picked3d.start) addMarker(picked3d.start, "#00d9c0", 8);
		for (const w of picked3d.waypoints) addMarker(w, "#f4a300", 7);
		if (picked3d.end) addMarker(picked3d.end, "#6c5ce7", 8);
	}

	function buildTerrain(spread) {
		clearPrimitive(terrainPrimitive);
		clearPrimitive(waterPrimitive);
		terrainPrimitive = null;
		waterPrimitive = null;

		const segments = 36;
		const cell = spread / segments;
		// Grid of world-space vertices + their height, sampled once and
		// reused both for the geometry itself and for `maxH` (banding
		// normalization) and building/marker ground level lookups.
		const grid = [];
		let maxH = 1;
		for (let j = 0; j <= segments; j++) {
			const row = [];
			for (let i = 0; i <= segments; i++) {
				const x = i * cell, y = j * cell;
				const h = terrainHeight(x, y);
				maxH = Math.max(maxH, Math.abs(h));
				row.push({ x, y, h });
			}
			grid.push(row);
		}

		// Bucket every triangle into one of the height bands by its average
		// height, then build one geometry instance per non-empty band -
		// see the HEIGHT_BANDS comment above for why banding instead of a
		// smooth per-vertex gradient.
		const bandTris = HEIGHT_BANDS.map(() => ({ positions: [], indices: [] }));
		const bandIndexFor = (t) => {
			for (let i = HEIGHT_BANDS.length - 1; i >= 0; i--) if (t >= HEIGHT_BANDS[i][0]) return i;
			return 0;
		};

		const addTri = (a, b, c) => {
			const avgH = (a.h + b.h + c.h) / 3;
			const t = Math.max(0, Math.min(1, (avgH + maxH) / (2 * maxH)));
			const bucket = bandTris[bandIndexFor(t)];
			const base = bucket.positions.length / 3;
			for (const p of [a, b, c]) {
				const w = localToWorld(p.x - spread / 2, p.y - spread / 2, p.h);
				bucket.positions.push(w.x, w.y, w.z);
			}
			bucket.indices.push(base, base + 1, base + 2);
		};

		for (let j = 0; j < segments; j++) {
			for (let i = 0; i < segments; i++) {
				const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
				addTri(a, b, c);
				addTri(b, d, c);
			}
		}

		const instances = [];
		bandTris.forEach((bucket, idx) => {
			if (!bucket.positions.length) return;
			const geometry = new Cesium.Geometry({
				attributes: {
					position: new Cesium.GeometryAttribute({
						componentDatatype: Cesium.ComponentDatatype.DOUBLE,
						componentsPerAttribute: 3,
						values: new Float64Array(bucket.positions),
					}),
				},
				indices: new Uint32Array(bucket.indices),
				primitiveType: Cesium.PrimitiveType.TRIANGLES,
				boundingSphere: Cesium.BoundingSphere.fromVertices(bucket.positions),
			});
			Cesium.GeometryPipeline.computeNormal(geometry);
			instances.push(new Cesium.GeometryInstance({
				geometry,
				attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#" + HEIGHT_BANDS[idx][1].toString(16).padStart(6, "0"))) },
			}));
		});

		terrainPrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
			geometryInstances: instances,
			appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false, closed: false }),
			shadows: Cesium.ShadowMode.RECEIVE_ONLY,
		}));

		// Translucent sea plane at a fixed low level - same idea as the
		// Three.js demo's water plane (only the deepest valleys sit below
		// it, read as flooded lowlands rather than the whole map).
		const waterLevel = -maxH * 0.55;
		const half = spread * 0.8;
		const corners = [
			localToWorld(-half, -half, waterLevel), localToWorld(half, -half, waterLevel),
			localToWorld(half, half, waterLevel), localToWorld(-half, half, waterLevel),
		];
		const positions = corners.flatMap(c => [c.x, c.y, c.z]);
		const waterGeom = new Cesium.Geometry({
			attributes: { position: new Cesium.GeometryAttribute({ componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(positions) }) },
			indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
			primitiveType: Cesium.PrimitiveType.TRIANGLES,
			boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
		});
		Cesium.GeometryPipeline.computeNormal(waterGeom);
		waterPrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
			geometryInstances: new Cesium.GeometryInstance({
				geometry: waterGeom,
				attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#0d3b52").withAlpha(0.65)) },
			}),
			appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: true, closed: false }),
		}));

		return { grid, maxH, segments, cell };
	}

	function buildIslandBuildings(data, spread) {
		clearPrimitive(buildingsPrimitive);
		buildingsPrimitive = null;
		if (!data.islands || data.islands.length <= 1) return;

		const pointById = new Map(data.points.map(p => [p.id, p]));
		const step = Math.max(5, spread * 0.028);
		const maxPerIsland = 75;
		const instances = [];

		data.islands.forEach((ids, islandIdx) => {
			const pts = ids.map(id => pointById.get(id)).filter(Boolean);
			if (pts.length < 3) return;
			const hull = convexHull2D(pts);
			if (hull.length < 3) return;

			const minX = Math.min(...hull.map(p => p.x)), maxX = Math.max(...hull.map(p => p.x));
			const minY = Math.min(...hull.map(p => p.y)), maxY = Math.max(...hull.map(p => p.y));

			let candidates = [];
			for (let y = minY; y <= maxY; y += step) {
				for (let x = minX; x <= maxX; x += step) {
					if (!pointInPolygon(hull, x, y)) continue;
					candidates.push({ x: x + (Math.random() - 0.5) * step * 0.6, y: y + (Math.random() - 0.5) * step * 0.6 });
				}
			}
			for (let i = candidates.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
			}
			const spots = candidates.slice(0, maxPerIsland);
			const color = Cesium.Color.fromCssColorString("#" + ISLAND_COLORS[islandIdx % ISLAND_COLORS.length].toString(16).padStart(6, "0"));

			for (const spot of spots) {
				const w = step * (0.35 + Math.random() * 0.25);
				const depth = step * (0.35 + Math.random() * 0.25);
				const height = 4 + Math.random() * 24;
				const ground = terrainHeight(spot.x, spot.y);

				const localMatrix = Cesium.Matrix4.fromTranslationQuaternionRotationScale(
					new Cesium.Cartesian3(spot.x - spread / 2, spot.y - spread / 2, ground + height / 2),
					Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, Math.random() * Math.PI * 2),
					Cesium.Cartesian3.ONE,
				);
				const modelMatrix = Cesium.Matrix4.multiply(ENU, localMatrix, new Cesium.Matrix4());

				instances.push(new Cesium.GeometryInstance({
					geometry: Cesium.BoxGeometry.fromDimensions({
						vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
						dimensions: new Cesium.Cartesian3(w, depth, height),
					}),
					modelMatrix,
					attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
				}));
			}
		});

		if (!instances.length) return;
		buildingsPrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
			geometryInstances: instances,
			appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
			shadows: Cesium.ShadowMode.ENABLED,
		}));
	}

	function buildRouteAndMarkers(data, spread) {
		clearPrimitive(routePrimitive);
		routePrimitive = null;
		clearEntities(markerEntities);
		routeSpline = null;

		const toWorld = (p) => localToWorld(p.x - spread / 2, p.y - spread / 2, terrainHeight(p.x, p.y) + 1.5);
		const chainWorldPts = [toWorld(data.start), ...data.chain.map(toWorld), toWorld(data.end)];

		// CatmullRomSpline needs >= 3 control points (it fits tangents
		// across neighbors) - a route with no intermediate stops at all
		// (just start -> end) only has 2, so fall back to a straight
		// LinearSpline in that case.
		const times = chainWorldPts.map((_, i) => i / (chainWorldPts.length - 1));
		routeSpline = chainWorldPts.length >= 3
			? new Cesium.CatmullRomSpline({ times, points: chainWorldPts })
			: new Cesium.LinearSpline({ times, points: chainWorldPts });

		const shape = [
			new Cesium.Cartesian2(-2.2, -2.2), new Cesium.Cartesian2(2.2, -2.2),
			new Cesium.Cartesian2(2.2, 2.2), new Cesium.Cartesian2(-2.2, 2.2),
		];
		const sampled = [];
		const samples = Math.max(16, chainWorldPts.length * 8);
		for (let i = 0; i <= samples; i++) sampled.push(routeSpline.evaluate(i / samples));

		const tubeGeom = Cesium.PolylineVolumeGeometry.createGeometry(new Cesium.PolylineVolumeGeometry({
			polylinePositions: sampled,
			shapePositions: shape,
			cornerType: Cesium.CornerType.ROUNDED,
		}));

		if (tubeGeom) {
			routePrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
				geometryInstances: new Cesium.GeometryInstance({
					geometry: tubeGeom,
					attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString("#ffd166")) },
				}),
				appearance: new Cesium.PerInstanceColorAppearance({ flat: false, translucent: false }),
				shadows: Cesium.ShadowMode.CAST_ONLY,
			}));
		}

		// Mandatory stops get a bigger amber marker, same visual language
		// as the 2D map and the Three.js demo.
		for (const p of data.chain) {
			const isStop = p.is_stop === true;
			const r = isStop ? 8 : 5;
			markerEntities.push(viewer.entities.add({
				position: toWorld(p),
				ellipsoid: {
					radii: new Cesium.Cartesian3(r, r, r),
					material: Cesium.Color.fromCssColorString(isStop ? "#f4a300" : "#ff5f7e"),
				},
			}));
		}

		markerEntities.push(viewer.entities.add({
			position: toWorld(data.start),
			ellipsoid: { radii: new Cesium.Cartesian3(7, 7, 7), material: Cesium.Color.fromCssColorString("#00d9c0") },
		}));
		markerEntities.push(viewer.entities.add({
			position: toWorld(data.end),
			ellipsoid: { radii: new Cesium.Cartesian3(7, 7, 7), material: Cesium.Color.fromCssColorString("#6c5ce7") },
		}));

		if (flowEntity) viewer.entities.remove(flowEntity);
		flowStartTime = performance.now();
		flowEntity = viewer.entities.add({
			position: chainWorldPts[0],
			point: { pixelSize: 10, color: Cesium.Color.fromCssColorString("#fff3c4"), outlineColor: Cesium.Color.fromCssColorString("#ffd166"), outlineWidth: 3 },
		});
	}

	function flyToScene(spread) {
		const center = localToWorld(0, 0, 0);
		const offset = new Cesium.HeadingPitchRange(Cesium.Math.toRadians(35), Cesium.Math.toRadians(-35), spread * 1.35);
		viewer.camera.lookAt(center, offset);
		viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
	}

	function setLoading3d(isLoading) {
		const btn = form3d.querySelector("button[type=submit]");
		btn.classList.toggle("is-loading", isLoading);
		btn.disabled = isLoading;
	}

	form3d.addEventListener("submit", async (e) => {
		e.preventDefault();
		if (!isActive()) return;
		if (!viewer) initViewer();

		const amountPoints = document.getElementById("amountPoints3d").value;
		const spread = Number(spreadInput3d.value);
		const maxHopDistance = document.getElementById("maxHopDistance3d").value;

		const paramObj = { amountPoints, spread, maxHopDistance };
		if (picked3d.start) { paramObj.startX = picked3d.start.x; paramObj.startY = picked3d.start.y; paramObj.startZ = picked3d.start.z; }
		if (picked3d.end) { paramObj.endX = picked3d.end.x; paramObj.endY = picked3d.end.y; paramObj.endZ = picked3d.end.z; }
		if (picked3d.waypoints.length) {
			paramObj.waypoints = picked3d.waypoints.map(w => `${w.x},${w.y},${w.z}`).join(";");
		}
		const params = new URLSearchParams(paramObj);

		setLoading3d(true);
		info3d.textContent = "Generating terrain and flight path…";
		try {
			const started = performance.now();
			const res = await fetch(`/api/traceroute3d?${params}`);
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.detail || res.statusText);
			}
			const data = await res.json();
			const elapsed = (performance.now() - started).toFixed(0);

			clearEntities(previewEntities);
			buildTerrain(spread);
			buildIslandBuildings(data, spread);
			buildRouteAndMarkers(data, spread);
			if (!picked3d.start) flyToScene(spread);

			stats3d.hidden = false;
			document.getElementById("statClosest3d").textContent = data.closest.length;
			document.getElementById("statIslands3d").textContent = data.bridges ? data.bridges.length + 1 : 1;
			document.getElementById("statDistance3d").textContent = data.direct_distance.toFixed(1);
			document.getElementById("statChain3d").textContent = data.chain_distance.toFixed(1);

			const detourGood = data.detour_factor < 1.1;
			info3d.innerHTML = `⚡ Solved in <strong>${elapsed}ms</strong> &nbsp;·&nbsp; `
				+ `<span style="color:#00d9c0">✈️ direct ${data.direct_distance.toFixed(1)}</span> &nbsp;·&nbsp; `
				+ `<span style="color:#ffd166">🛣️ chain ${data.chain_distance.toFixed(1)}</span> `
				+ `<span style="color:${detourGood ? '#7ee787' : '#ff5f7e'}">(${data.detour_factor.toFixed(2)}× ${detourGood ? '🎯' : '⚠️'})</span>`;
		} catch (err) {
			info3d.textContent = `Error: ${err.message}`;
		} finally {
			setLoading3d(false);
		}
	});

	undoBtn3d.addEventListener("click", () => { if (isActive()) undoLastPoint3d(); });
	spreadInput3d.addEventListener("change", () => {
		if (!isActive()) return;
		picked3d = { start: null, waypoints: [], end: null };
		updateClickStatus3d();
		drawPreview3d();
	});

	if (engineSelect3d) {
		engineSelect3d.addEventListener("change", () => {
			if (isActive()) updateClickStatus3d();
		});
	}
})();
