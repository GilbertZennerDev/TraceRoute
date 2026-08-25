const form = document.getElementById("form");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const info = document.getElementById("info");

function draw(data, spread) {
	const scaleX = canvas.width / spread;
	const scaleY = canvas.height / spread;

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = "black";
	for (const p of data.points) {
		ctx.beginPath();
		ctx.arc(p.x * scaleX, p.y * scaleY, 1.5, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.fillStyle = "red";
	for (const p of data.closest) {
		ctx.beginPath();
		ctx.arc(p.x * scaleX, p.y * scaleY, 4, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.fillStyle = "lime";
	ctx.beginPath();
	ctx.arc(data.start.x * scaleX, data.start.y * scaleY, 7, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = "orange";
	ctx.beginPath();
	ctx.arc(data.end.x * scaleX, data.end.y * scaleY, 7, 0, Math.PI * 2);
	ctx.fill();
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

	info.textContent = "Running...";
	try {
		const res = await fetch(`/api/traceroute?${params}`);
		if (!res.ok) {
			const err = await res.json();
			throw new Error(err.detail || res.statusText);
		}
		const data = await res.json();
		draw(data, spread);
		info.textContent = `Direct distance: ${data.direct_distance.toFixed(2)} | Closest points: ${data.closest.length}`;
	} catch (err) {
		info.textContent = `Error: ${err.message}`;
	}
});

form.dispatchEvent(new Event("submit"));
