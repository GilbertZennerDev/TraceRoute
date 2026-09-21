# Recording checklist

## Before you hit record
- **URL:** `http://localhost:8000/?demo=1` (swap the port for whatever
  `uvicorn`/Docker prints — `?demo=1` is what matters, it must be on every
  load you record).
- **Reset between takes:** just reload the page (`Ctrl/Cmd+R`) with
  `?demo=1` still in the address bar. Demo mode re-seeds fresh input
  values and the auto-run fires again on every load, so there's no manual
  "clear state" step. If you manually clicked a custom origin/destination
  for shot 3a and want to discard it, click **↩ Undo** until the click
  status reads "Click the terrain to set the origin" again, or just reload.
- **cpp engine must be available**, or the auto-run will 503 and the map
  will sit empty. Check `http://localhost:8000/api/engine-status` returns
  `{"cpp_available": true}` before recording. If it's `false`, either run
  the Docker image (it builds `libtraceroute.so` in its build stage) or
  build it locally from `webapp/cpp_core/traceroute_core.cpp` and restart
  the server — the frontend's Engine dropdown defaults to C++ and demo mode
  doesn't override that.

## Window / framing
- **Browser window / viewport:** 1920×1080 if you can get a real 1080p
  browser window; otherwise any 16:9 window and crop in post. The `#demo`
  panel's canvas is a fixed 900×600 internal buffer scaled to its CSS box,
  so it stays sharp at typical desktop widths — no need to go wider than
  ~1400px browser width for a crisp capture.
- **Browser zoom:** 100%. Demo mode already bumps base font size and stat
  values ~10-15% (see `body.demo-mode` rules in `style.css`) so you
  shouldn't need extra browser zoom on top of that — adding both makes text
  oversized relative to the map.
- **Scroll position:** frame the `#demo` section so the controls column and
  the map fill the shot with minimal empty page above/below. The hero
  section above it is good for a establishing screenshot but not for the
  main recording.

## Known visual things to avoid framing
- The page has a visible **scrollbar** on the right edge in most browsers —
  crop it out or use a browser/OS combo that overlays scrollbars.
- The **stats grid** stays `hidden` until the first successful run
  completes — don't start recording mid-load before the auto-run finishes
  (~1–1.5s after page load), or the first visible frame will show em-dashes
  (`–`) instead of numbers.
- Switching the **View** dropdown to 3D (CesiumJS) triggers a fresh
  network/tile load and a few seconds of terrain streaming in — if you use
  the 3D shot in the script, let it fully settle before cutting rather than
  catching it mid-load with low-res terrain tiles.
- The **map legend** and **Undo/Reset view** buttons sit right on top of
  the canvas corners — fine to leave visible, but don't crop so tight that
  they get half-cut-off.
- If you manually click to place points near the very edge of the canvas,
  the pin icon can render partially outside the canvas box — keep clicks
  comfortably inside the visible map, not right at the border.

## Suggested Streamlabs settings
- **Resolution:** 1920×1080 (match the browser window 1:1 — no scaling —
  so on-screen text stays crisp at JetBrains Mono's small stat-label size).
- **Frame rate:** 30fps is enough (the marching-ants bridge animation and
  count-up numbers are smooth CSS/rAF transitions, not fast motion) — use
  60fps only if you're also capturing the 3D globe view, where camera
  motion benefits more from it.
- **Cursor:** turn cursor highlighting **on** — the whole core-flow section
  of the script is click-driven (origin/waypoint/destination/Run button),
  so viewers need to see where you're clicking. Turn it back off for the
  hook/payoff/end-card shots where the cursor should stay out of frame.
- **Encoder:** whatever your Streamlabs default hardware encoder is (NVENC/
  QuickSync) — this content has no fast motion or fine grain, so there's no
  need to raise the bitrate above your normal preset.

## Walkthrough confirmation (done by the assistant before recording)
- Started the FastAPI app locally, confirmed `/api/engine-status` reports
  `cpp_available: true` after building `libtraceroute.so`.
- Loaded `?demo=1`, confirmed the amount-of-points/map-size/max-hop inputs
  pre-seed to 1400 / 900 / 18 and the auto-run fires and completes without
  errors (`GET /api/traceroute3d?...&engine=cpp` → `200 OK`).
- Confirmed via the page's live stats that a real route was computed
  (1400 points generated, 31 stops used, 3 islands crossed, C++ solved in
  ~66ms) and that the count-up/animation code paths run without console
  errors.
