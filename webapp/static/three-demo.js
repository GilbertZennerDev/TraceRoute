(() => {
	const container = document.getElementById("three-container");
	const form3d = document.getElementById("form3d");
	const info3d = document.getElementById("info3d");
	if (!container || !form3d) return;

	const SPREAD_REF = 500; // terrain noise is tuned against this scale

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
	let terrainGroup, pointsGroup;

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
		const mesh = new THREE.Mesh(geo, mat);
		mesh.rotation.x = -Math.PI / 2;
		terrainGroup.add(mesh);

		const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x1a2230, wireframe: true, transparent: true, opacity: 0.15 }));
		wire.rotation.x = -Math.PI / 2;
		terrainGroup.add(wire);

		scene.add(terrainGroup);
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
		pointsGroup = new THREE.Group();

		const bgGeo = new THREE.BufferGeometry();
		const bgPositions = [];
		for (const p of data.points) {
			const v = toScene(p, spread);
			bgPositions.push(v.x, v.y, v.z);
		}
		bgGeo.setAttribute("position", new THREE.Float32BufferAttribute(bgPositions, 3));
		const bgMat = new THREE.PointsMaterial({ color: 0x9aa3b5, size: 4, sizeAttenuation: true, transparent: true, opacity: 0.7 });
		pointsGroup.add(new THREE.Points(bgGeo, bgMat));

		const chainPts = [toScene(data.start, spread), ...data.chain.map(p => toScene(p, spread)), toScene(data.end, spread)];
		const curve = new THREE.CatmullRomCurve3(chainPts);
		const tubeGeo = new THREE.TubeGeometry(curve, Math.max(8, chainPts.length * 6), 2.2, 8, false);
		const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x664200, roughness: 0.4 });
		pointsGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

		const sphereGeo = new THREE.SphereGeometry(5, 16, 16);
		for (const p of data.chain) {
			const m = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: 0xff5f7e, emissive: 0x4a0f1c }));
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
		const spread = Number(document.getElementById("spread3d").value);

		setLoading3d(true);
		info3d.textContent = "Generating terrain and flight path…";
		try {
			const started = performance.now();
			const res = await fetch(`/api/traceroute3d?amountPoints=${amountPoints}&spread=${spread}`);
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.detail || res.statusText);
			}
			const data = await res.json();
			const elapsed = (performance.now() - started).toFixed(0);

			buildTerrain(spread);
			buildPoints(data, spread);
			camera.position.set(spread * 0.9, spread * 0.65, spread * 0.9);
			controls.target.set(0, 0, 0);

			info3d.innerHTML = `⚡ Solved in <strong>${elapsed}ms</strong> &nbsp;·&nbsp; `
				+ `<span style="color:#00d9c0">✈️ direct ${data.direct_distance.toFixed(1)}</span> &nbsp;·&nbsp; `
				+ `<span style="color:#ffd166">🛣️ chain ${data.chain_distance.toFixed(1)}</span> `
				+ `<span style="color:#7ee787">(${data.detour_factor.toFixed(2)}×)</span>`;
		} catch (err) {
			info3d.textContent = `Error: ${err.message}`;
		} finally {
			setLoading3d(false);
		}
	});

	form3d.dispatchEvent(new Event("submit"));
})();
