(() => {
	const container = document.getElementById("three-container");
	const form3d = document.getElementById("form3d");
	const info3d = document.getElementById("info3d");
	const clickStatus3d = document.getElementById("clickStatus3d");
	const stats3d = document.getElementById("stats3d");
	const undoBtn3d = document.getElementById("undoPoint3d");
	const spreadInput3d = document.getElementById("spread3d");
	if (!container || !form3d) return;

	const SPREAD_REF = 500; // terrain noise is tuned against this scale

	// Same island palette as the 2D demo (script.js) - kept as a separate
	// constant since this file is a standalone IIFE with no shared module
	// system to import it from.
	const ISLAND_COLORS = [0x8ecae6, 0xffb703, 0xfb8500, 0x06d6a0, 0xc77dff, 0xf72585, 0x90e0ef, 0xe9c46a];

	// Real fractal (multi-octave simplex) noise via the simplex-noise
	// library - previously this was hand-rolled overlapping sines, which
	// tiles visibly and doesn't read as natural terrain the way layered
	// simplex noise does.
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

	function heightColor(h, maxH) {
		const t = Math.max(0, Math.min(1, (h + maxH) / (2 * maxH)));
		// low -> deep blue-teal, mid -> green, high -> pale rock
		const stops = [
			[0.05, 0.09, 0.16], [0.05, 0.25, 0.28], [0.15, 0.38, 0.22],
			[0.45, 0.42, 0.28], [0.72, 0.70, 0.66],
		];
		const scaled = t * (stops.length - 1);
		const i = Math.min(stops.length - 2, Math.floor(scaled));
		const f = scaled - i;
		const c = [0, 1, 2].map(k => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f);
		return new THREE.Color(c[0], c[1], c[2]);
	}

	let scene, camera, renderer, controls;
	let terrainGroup, terrainMesh, pointsGroup, previewGroup;
	const raycaster = new THREE.Raycaster();
	const mouseNDC = new THREE.Vector2();

	// Lets the user click the terrain to place origin/destination, same flow
	// as the 2D demo: plain click sets origin then destination, Shift+click
	// in between adds a mandatory stop. Coordinates are algorithm-space
	// (0..spread) on x/y; z (the third routing dimension, not used for
	// visual placement - see toScene) is fixed at the map's mid-plane since
	// there's no natural way to pick it by clicking a 2D terrain surface.
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

	function initScene() {
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0b0e14);
		scene.fog = new THREE.Fog(0x0b0e14, 400, 1400);

		const w = container.clientWidth, h = container.clientHeight || w * 0.6667;
		camera = new THREE.PerspectiveCamera(50, w / h, 1, 3000);
		camera.position.set(SPREAD_REF * 0.9, SPREAD_REF * 0.65, SPREAD_REF * 0.9);

		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		container.appendChild(renderer.domElement);

		controls = new THREE.OrbitControls(camera, renderer.domElement);
		controls.target.set(0, 0, 0);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.minDistance = 100;
		controls.maxDistance = 2000;

		scene.add(new THREE.AmbientLight(0x8899bb, 0.7));
		const sun = new THREE.DirectionalLight(0xfff3e0, 1.1);
		sun.position.set(300, 500, 200);
		scene.add(sun);

		window.addEventListener("resize", onResize);

		// A plain click (down/up with negligible movement) picks a point;
		// anything that moved further was an orbit/pan drag through
		// OrbitControls and shouldn't also place a point.
		let downPos = null;
		renderer.domElement.addEventListener("pointerdown", (e) => {
			downPos = { x: e.clientX, y: e.clientY };
		});
		renderer.domElement.addEventListener("pointerup", (e) => {
			if (!downPos) return;
			const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
			downPos = null;
			if (moved > 6) return;
			handlePick3d(e);
		});

		animate();
	}

	function onResize() {
		const w = container.clientWidth, h = container.clientHeight || w * 0.6667;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setSize(w, h);
	}

	function animate() {
		requestAnimationFrame(animate);
		controls.update();
		renderer.render(scene, camera);
	}

	function clearGroup(group) {
		if (!group) return;
		scene.remove(group);
		group.traverse(obj => {
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) obj.material.dispose();
		});
	}

	function buildTerrain(spread) {
		clearGroup(terrainGroup);
		terrainGroup = new THREE.Group();

		// Spans exactly [0, spread] on both axes, same as the points'
		// coordinate space (toScene below), so the mesh a point "stands on"
		// is sampled at that point's own (x, y) - no size/offset mismatch.
		const segments = 90;
		const geo = new THREE.PlaneGeometry(spread, spread, segments, segments);
		const pos = geo.attributes.position;
		const colors = [];
		let maxH = 1;
		for (let i = 0; i < pos.count; i++) {
			const localX = pos.getX(i), localY = pos.getY(i);
			const h = terrainHeight(localX + spread / 2, localY + spread / 2);
			pos.setZ(i, h);
			maxH = Math.max(maxH, Math.abs(h));
		}
		for (let i = 0; i < pos.count; i++) {
			const c = heightColor(pos.getZ(i), maxH);
			colors.push(c.r, c.g, c.b);
		}
		geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
		geo.computeVertexNormals();

		// No position offset: the geometry's local vertex range is already
		// exactly [-spread/2, spread/2] on both axes, matching toScene()'s
		// point mapping (sx = p.x - spread/2, sz = p.y - spread/2) 1:1.
		const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
		terrainMesh = new THREE.Mesh(geo, mat);
		terrainMesh.rotation.x = -Math.PI / 2;
		terrainGroup.add(terrainMesh);

		const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x1a2230, wireframe: true, transparent: true, opacity: 0.15 }));
		wire.rotation.x = -Math.PI / 2;
		terrainGroup.add(wire);

		scene.add(terrainGroup);
	}

	// Inverts toScene's (x, y) -> world mapping via a raycast against the
	// terrain mesh, so a screen click resolves to algorithm-space (x, y).
	function pickTerrainXY(clientX, clientY, spread) {
		if (!terrainMesh) return null;
		const rect = renderer.domElement.getBoundingClientRect();
		mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(mouseNDC, camera);
		const hits = raycaster.intersectObject(terrainMesh, false);
		if (!hits.length) return null;
		const p = hits[0].point;
		return { x: p.x + spread / 2, y: p.z + spread / 2 };
	}

	function handlePick3d(e) {
		const spread = Number(spreadInput3d.value) || 500;
		const xy = pickTerrainXY(e.clientX, e.clientY, spread);
		if (!xy) return;
		const point = { x: xy.x, y: xy.y, z: spread / 2 };

		if (!picked3d.start || picked3d.end) {
			picked3d = { start: point, waypoints: [], end: null };
		} else if (e.shiftKey) {
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
	undoBtn3d.addEventListener("click", undoLastPoint3d);

	spreadInput3d.addEventListener("change", () => {
		picked3d = { start: null, waypoints: [], end: null };
		updateClickStatus3d();
		drawPreview3d();
	});

	function drawPreview3d() {
		if (!scene) return;
		clearGroup(previewGroup);
		previewGroup = new THREE.Group();
		const spread = Number(spreadInput3d.value) || 500;

		const markerGeo = new THREE.SphereGeometry(7, 16, 16);
		const addMarker = (p, color, size) => {
			const m = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
			m.position.copy(toScene(p, spread));
			previewGroup.add(m);
		};
		if (picked3d.start) addMarker(picked3d.start, 0x00d9c0, 8);
		for (const w of picked3d.waypoints) addMarker(w, 0xf4a300, 7);
		if (picked3d.end) addMarker(picked3d.end, 0x6c5ce7, 8);

		scene.add(previewGroup);
	}

	// Maps algorithm-space (x, y, all 0..spread) to scene-space. Points sit
	// ON the terrain - the Y (height) comes from sampling the SAME
	// terrainHeight(x, y) the mesh itself was built from at that (x, y),
	// so a point is never floating above or sinking into the ground.
	// z from the 3D algorithm still drives the routing math (see
	// algorithm3d.py) but isn't used for vertical placement here - this
	// view is "waypoints on a terrain surface", not "altitude above it".
	function toScene(p, spread) {
		const sx = p.x - spread / 2;
		const sz = p.y - spread / 2;
		const ground = terrainHeight(p.x, p.y);
		return new THREE.Vector3(sx, ground + 1.5, sz);
	}

	function buildPoints(data, spread) {
		clearGroup(pointsGroup);
		clearGroup(previewGroup);
		pointsGroup = new THREE.Group();

		// Color the background cloud by island, same palette as the 2D
		// demo, so "which island is this point in" reads at a glance in 3D
		// too - a flat gray cloud doesn't show the NYC-principle structure
		// the routing is actually built on.
		const islandOfId = new Map();
		if (data.islands && data.islands.length > 1) {
			data.islands.forEach((ids, islandIdx) => ids.forEach(id => islandOfId.set(id, islandIdx)));
		}

		const bgGeo = new THREE.BufferGeometry();
		const bgPositions = [], bgColors = [];
		const fallbackColor = new THREE.Color(0x9aa3b5);
		for (const p of data.points) {
			const v = toScene(p, spread);
			bgPositions.push(v.x, v.y, v.z);
			if (islandOfId.has(p.id)) {
				const c = new THREE.Color(ISLAND_COLORS[islandOfId.get(p.id) % ISLAND_COLORS.length]);
				bgColors.push(c.r, c.g, c.b);
			} else {
				bgColors.push(fallbackColor.r, fallbackColor.g, fallbackColor.b);
			}
		}
		bgGeo.setAttribute("position", new THREE.Float32BufferAttribute(bgPositions, 3));
		bgGeo.setAttribute("color", new THREE.Float32BufferAttribute(bgColors, 3));
		const bgMat = new THREE.PointsMaterial({ vertexColors: true, size: 4, sizeAttenuation: true, transparent: true, opacity: 0.75 });
		pointsGroup.add(new THREE.Points(bgGeo, bgMat));

		// Island bridges: the single closest point-pair connecting two
		// islands, drawn as a dashed line - same idea as the 2D demo's
		// animated dashed bridges, just static here.
		if (data.bridges) {
			for (const bridge of data.bridges) {
				const a = toScene(bridge.a, spread), b = toScene(bridge.b, spread);
				const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
				const mat = new THREE.LineDashedMaterial({ color: 0xffd166, dashSize: 6, gapSize: 4, linewidth: 1 });
				const line = new THREE.Line(geo, mat);
				line.computeLineDistances();
				pointsGroup.add(line);
			}
		}

		const chainPts = [toScene(data.start, spread), ...data.chain.map(p => toScene(p, spread)), toScene(data.end, spread)];
		const curve = new THREE.CatmullRomCurve3(chainPts);
		const tubeGeo = new THREE.TubeGeometry(curve, Math.max(8, chainPts.length * 6), 2.2, 8, false);
		const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x664200, roughness: 0.4 });
		pointsGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

		// Mandatory stops (client-placed) get a bigger amber sphere, same
		// distinction the 2D demo draws with its pin icons.
		const stopSphereGeo = new THREE.SphereGeometry(8, 16, 16);
		const chainSphereGeo = new THREE.SphereGeometry(5, 16, 16);
		for (const p of data.chain) {
			const isStop = p.is_stop === true;
			const geo = isStop ? stopSphereGeo : chainSphereGeo;
			const color = isStop ? 0xf4a300 : 0xff5f7e;
			const emissive = isStop ? 0x4a3000 : 0x4a0f1c;
			const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive }));
			m.position.copy(toScene(p, spread));
			pointsGroup.add(m);
		}

		const startMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16), new THREE.MeshStandardMaterial({ color: 0x00d9c0, emissive: 0x004a40 }));
		startMesh.position.copy(toScene(data.start, spread));
		pointsGroup.add(startMesh);

		const endMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16), new THREE.MeshStandardMaterial({ color: 0x6c5ce7, emissive: 0x25184a }));
		endMesh.position.copy(toScene(data.end, spread));
		pointsGroup.add(endMesh);

		scene.add(pointsGroup);
	}

	function setLoading3d(isLoading) {
		const btn = form3d.querySelector("button[type=submit]");
		btn.classList.toggle("is-loading", isLoading);
		btn.disabled = isLoading;
	}

	form3d.addEventListener("submit", async (e) => {
		e.preventDefault();
		if (!scene) initScene();

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

			buildTerrain(spread);
			buildPoints(data, spread);
			if (!picked3d.start) {
				camera.position.set(spread * 0.9, spread * 0.65, spread * 0.9);
				controls.target.set(0, 0, 0);
			}

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

	updateClickStatus3d();
	form3d.dispatchEvent(new Event("submit"));
})();
