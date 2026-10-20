# FleetOs onboarding video storyboard

A prompt for generating a 60-second product film, in the style of `prompts/0xnicc0-516612.md`.

```text
<inputs>
Ask me for: the operator brand name for the wordmark, one accent color, and a royalty-free track around 120 BPM (e.g. Mixkit, free for commercial use).
</inputs>

<direction>
Fleet operations UI motion in one continuous take. One shape tells the whole story: a booking card becomes a dispatched trip pill with the driver's name, the pill becomes a trip bar with the odometer, the bar becomes a cash receipt, and the receipt becomes the booking card again. No cuts, no fades between scenes: objects transform. A cursor triggers every change with real clicks. Off-white canvas, black UI, one accent color, Inter for UI and the wordmark. Springs everywhere with only a slight overshoot. Zoom the camera so each moment fills the square.
Banned: crossfades, gradients on UI, particles, glows, bouncy easing, dead beats, anything that feels like a template.
</direction>

<structure>
120 BPM, 30 beats, 60 seconds, about 6 beats per stage. Something happens on every beat.
Beats 1-6, create a booking: the cursor clicks "New booking", pickup and drop type in, a trip type chip is chosen, the card settles with a fare.
Beats 7-12, dispatch: the card shrinks into a trip pill, driver chips spring out, the cursor picks one, the driver's name and vehicle lock into the pill.
Beats 13-18, start and complete the trip: the pill stretches into a trip bar, the start odometer reading counts in, the bar fills along the route, the end odometer reading counts in, a checkmark lands.
Beats 19-24, record the cash: the bar folds into a cash receipt, the amount types in, cash or UPI is selected, the receipt stamps collected.
Beats 25-30, handover approved, then the wordmark: the driver sends the handover, the admin cursor taps approve, the receipt turns into the empty booking card and the wordmark rises letter by letter. Last frame = first frame.
</structure>

<build>
1. One HTML file with a 1440x1440 canvas. Draw everything inside seek(t): no CSS transitions, timers or state carried between frames.
2. Use closed-form spring step responses, one spring per change of target, so every value is a pure function of time.
3. The main shape is one rounded rect whose width, height, radius, position and color are each a chain of springs.
4. Typing and counting are derived from time. The caret blinks only when idle.
5. Find the beat grid of the track, start on a downbeat and place every click on its measured peak.
6. Render with Playwright at 60 fps, then encode H.264 CRF 16 and loudnorm to -14 LUFS.
7. Render one still per beat first. Fix anything cramped, off-grid or hard to read before the full render.
</build>

<gotchas>
Text inside a morphing shape needs its own clip and separate enter/exit timing. Text swaps never overlap. The cursor must end at the exact position it started, or the loop will stutter.
</gotchas>

Banned: crossfades, gradients on UI, particles, glows, bouncy easing, dead beats.
```
