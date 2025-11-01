# ECG React Visualizer (Vite)

Six‑lead ECG visualizer built with React + Vite. Connects over Web Serial (Chrome/Edge) and renders a paper grid with adjustable gain, pixels/mm, window, per‑lead visibility, and PNG export.

## Quick start

1. Requirements: Node.js 18+; use Chrome or Edge (Web Serial).
2. Install and run:

```bash
npm install
npm run dev
```

3. Open the shown localhost URL. Click "Connect Device" and choose your Arduino/serial device.

## App usage

- Gain: multiplies vertical amplitude (mm/mV).
- Pixels/mm: adjusts screen resolution of the ECG paper.
- Window (s): seconds displayed.
- Show/Hide: per‑lead visibility.
- Export PNG: saves a stacked image of all visible leads.

## Data format (serial)

One JSON object per line (LF newline), 125 samples/second recommended:

```json
{"lead1": <number>, "lead2": <number>, "lead3": <number>, "avr": <number>, "avl": <number>, "avf": <number>}
```

Units:
- If you send raw ADC counts (0..1023), the app converts to mV assuming 5V reference.
- If you send values already in mV, the app will use them as‑is.

Also supported (for your existing sketches):
- 6‑value CSV per line: `lead1,lead2,lead3,avr,avl,avf`
- 2‑value CSV per line: `lead1,lead2` (Lead I, Lead II). The app computes Lead III, aVR, aVL, aVF automatically.

## Using your own Arduino Nano

This app works with your existing firmware. It accepts:

- JSON lines with fields: `lead1, lead2, lead3, avr, avl, avf`
- 6‑value CSV: `lead1,lead2,lead3,avr,avl,avf`
- 2‑value CSV: `lead1,lead2` (Lead I, Lead II). The app derives Lead III, aVR, aVL, aVF.

Settings in the top bar:
- Input Units: set to mV if you output millivolts; set to ADC if you send 0–1023 counts.
- Sample rate (Hz): set to your firmware’s sample rate (125 Hz recommended) so sweep speed matches 25 mm/s.
- Gain and Pixels/mm: use these to match 10 mm/mV; a 1 mV calibration pulse will appear at the strip start.

## Notes

- Use Chrome/Edge. Safari/Firefox do not support Web Serial.
- Basic BPM is estimated from Lead II R‑peaks; tune threshold or lead if needed.
- If traces look too thick, reduce Pixels/mm; if too small, increase Gain.

## License

MIT
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
