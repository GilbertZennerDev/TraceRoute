const form = document.getElementById("form");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const info = document.getElementById("info");
const stats = document.getElementById("stats");
const submitBtn = form.querySelector("button[type=submit]");

function draw(data, spread) {
	const scaleX = canvas.width / spread;
	const scaleY = canvas.height / spread;

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = "rgba(154, 163, 181, 0.55)";
	for (const p of data.points) {
		ctx.beginPath();
		ctx.arc(p.x * scaleX, p.y * scaleY, 1.6, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.strokeStyle = "rgba(0, 217, 192, 0.35)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(data.start.x * scaleX, data.start.y * scaleY);
	ctx.lineTo(data.end.x * scaleX, data.end.y * scaleY);
	ctx.stroke();

	ctx.shadowColor = "#ff5f7e";
	ctx.shadowBlur = 8;
	ctx.fillStyle = "#ff5f7e";
	for (const p of data.closest) {
		ctx.beginPath();
		ctx.arc(p.x * scaleX, p.y * scaleY, 4.5, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.shadowBlur = 0;

	ctx.fillStyle = "#00d9c0";
	ctx.beginPath();
	ctx.arc(data.start.x * scaleX, data.start.y * scaleY, 7, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = "#6c5ce7";
	ctx.beginPath();
	ctx.arc(data.end.x * scaleX, data.end.y * scaleY, 7, 0, Math.PI * 2);
	ctx.fill();
}

function setLoading(isLoading) {
	submitBtn.classList.toggle("is-loading", isLoading);
	submitBtn.disabled = isLoading;
}

form.addEventListener("submit", async (e) => {
	e.preventDefault();

	const params = new URLSearchParams({
		amountPoints: document.getElementById("amountPoints").value,
		startIndex: document.getElementById("startIndex").value,
		endIndex: document.getElementById("endIndex").value,
		amountClosestPoints: document.getElementById("amountClosestPoints").value,
		spread: document.getElementById("spread").value,
	});
	const spread = Number(document.getElementById("spread").value);

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

		info.textContent = `Solved in ${elapsed}ms · direct distance ${data.direct_distance.toFixed(2)}`;
	} catch (err) {
		info.textContent = `Error: ${err.message}`;
	} finally {
		setLoading(false);
	}
});

form.dispatchEvent(new Event("submit"));
