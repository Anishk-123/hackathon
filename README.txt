RESQNET – FRONTEND (HTML/CSS/JS)  |  DEMO MODE

HOW TO RUN (easiest)
1. Unzip the folder.
2. Option A: double-click index.html (works, but offline caching/PWA install need option B).
   Option B (recommended): open a terminal in the folder and run:  python -m http.server 8000
   then open http://localhost:8000 in Chrome.
3. Demo logins (password demo123): citizen@demo, authority@demo, rescue@demo.

TRY THIS FLOW
- Citizen: press SOS, fill form, send. Open another tab/window as authority@demo to see it in the control room.
- Authority: Incidents > Open > Override priority, Create/Assign team.
- Rescue: log in as rescue@demo > Accept and update progress.
- Offline test: Chrome DevTools > Network > Offline, send SOS (shows "saved, NOT YET delivered"), go online -> it syncs once.

IMPORTANT HONESTY NOTES
- No real server: data lives in your browser (localStorage). "Delivered" means saved in that local demo store.
- Triage is a keyword fallback only. The Hugging Face model, Firebase push, Cloud Storage uploads and real login need the backend.
- Early-warning feed is labelled demonstration data. Satellite module is a simulation. No safe zones are pre-filled.
- Maps need internet to load Leaflet and OpenStreetMap tiles the first time.
- Voice input works only in browsers that support it (usually needs internet). Kannada/Hindi voice depends on your device.
