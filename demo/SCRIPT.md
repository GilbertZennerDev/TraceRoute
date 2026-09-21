# TraceRoute — LinkedIn demo shot list (~40s)

All shots use `http://localhost:8000/?demo=1` (or whatever port the app is
running on, with `?demo=1` appended). Demo mode pre-seeds 1400 points on a
900km map with an 18km max hop, auto-runs the route on load, and adds
smooth fade-ins / count-up stats / a progress-bar "computing" beat so
nothing jump-cuts. See `CHECKLIST.md` for window/zoom/recording settings.

---

## 1. Hook (0–3s)
**State:** Page freshly loaded at `?demo=1`, scrolled so the `#demo` panel
fills the frame (map on the right, controls on the left). The auto-run has
already completed: colored islands with soft coastlines, a glowing yellow
route with animated marching-ant bridges between islands, a teal origin pin
and purple destination pin.
**Action:** None — just load the page and let the auto-run finish
(~1–1.5s) before starting the recording, so the very first visible frame is
already the payoff state, not a blank form.
**Hold:** 3s, static camera, let the bridge dash animation read as motion.

## 2. Problem/context (3–10s)
**State:** Same frame, unchanged.
**On-screen text overlay (add in post, not spoken):**
> "Most routers search a graph. TraceRoute just draws a line — and finds
> the fewest, straightest stops that keep every leg short."
**Action:** None. Optionally a slow, subtle zoom-in (105%) over these 7s to
add motion without a real UI action.
**Hold:** 7s.

## 3. Core flow (10–30s) — 3 actions, simple → impressive
**Shot 3a (10–15s): Reset and re-pick a route by hand.**
- Click **↩ Undo** repeatedly or reload with `?demo=1` fresh, then click
  once on an empty area of the map to set a new **origin** (teal pin drops
  in with its glow).
- Shift+click a second spot to add one **mandatory stop** (amber pin,
  slightly larger, "🚩 1 mandatory stop added" status line updates).
- Click a third spot to set the **destination** (purple pin).
- Hold each click ~1s so the pin-drop and status-text change are visible.

**Shot 3b (15–22s): Submit and watch it compute.**
- Click **Run TraceRoute**. The button shows its spinner, the map dims
  slightly, and the thin progress bar under the map sweeps left→right
  (demo mode stretches this to ~0.5–0.9s so it's visible on camera).
- Cut to the moment the map un-dims and the canvas fades back in with the
  new route drawn.

**Shot 3c (22–30s): Show the stat count-up.**
- Static hold on the stats grid (points / stops / direct distance / chain
  distance / detour factor / longest leg / islands crossed) as the numbers
  animate up from their previous values to the new ones. This is the
  clearest "it computed something real" beat — hold until every number has
  settled (~0.7s after the numbers start moving).

## 4. Payoff (30–40s)
**State:** Zoom the frame in (crop in post, or use the mouse-wheel zoom
live) on one island crossing — a bridge's dashed yellow line jumping from
one colored coastline to another — with the "islands crossed" and "detour
factor" stats visible in a corner.
**Action:** Optional: switch **View → 3D (CesiumJS)** to show the same
route rendered as a globe with real terrain, as the "and it's not just a
flat toy" beat. Let the globe finish loading and settle on the route before
cutting.
**Hold:** 8–10s. This is the single most shareable frame — favor it if you
can only keep one still image from the whole recording.

## 5. End card (40–45s)
**State:** Paused on the 3D globe view (or the best 2D frame from step 4),
slightly darkened via a post-production overlay.
**Text:**
> **TraceRoute**
> Skip the road graph. Draw the line instead.
**Hold:** 5s, then cut.

---

### Notes
- Total run time target: 40–45s. Trim shot 2's hold first if you need to
  come in under 40s — the hook and payoff matter more than the context beat.
- If Shot 3a's manual click sequence looks fiddly on camera, it's fine to
  skip it and just reload `?demo=1` twice back-to-back (two different
  auto-generated routes) — the count-up and progress bar still sell "it's
  live," and it's a safer take.
