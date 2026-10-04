# swiss

ORBIO's public website: two static information pages and a Flask-powered
interactive virtual experiment.

## Run the interactive experiment

From this directory:

```powershell
python -m pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000/`.

The app bundles its corrected-run metadata and paired omics contrasts in
`data/`. The browser experiment provides 50 gravity × tissue × morphology
conditions and a 71-step Day 0–7 trajectory.

## Serve the static pages

From this directory:

```powershell
python -m http.server 8080
```

Open `http://127.0.0.1:8080/` for the model overview and
`http://127.0.0.1:8080/explore/` for results. The static pages can be hosted
with GitHub Pages. The Flask virtual experiment requires a Python application
host; set `HOST` and `PORT` to match that host.

## Corrected-run provenance

The displayed run details are derived from
`outputs/pipeline_corrected_v2/summary.json`. This profile records:

- NVIDIA GeForce RTX 5070 Ti, 15.9 GB VRAM, CUDA 12.8, and PyTorch
  2.11.0+cu128; compute capability 12.0 with BF16 supported and AMP enabled.
- 480 scenarios, 4 workers, a 48³ field grid at 20 µm spacing, and a
  5,000-agent cap.
- 768 cells per graph, encoder training for 60 epochs, prediction heads for
  400 epochs, an 8-model ensemble, and graph batches of 32.

The compact, website-ready record is `data/run_metadata.json`. The neural
flight and CRC clinostat contrasts are bundled under
`data/outputs/omics/`; the interface identifies their original output paths.
The website uses these bundled records as its runtime science data.

## Website files

- `index.html`, `explore/`, `src/`, and `public/` contain the static pages and
  their assets.
- `app.py`, `templates/`, and `static/` contain the interactive experiment.
- `data/` contains the small provenance records required by the Flask app.

## Deploy on Render

The repo includes [render.yaml](render.yaml). Create a Render Blueprint (or a Web Service) from this repository. Build: `pip install -r requirements.txt`. Start: `gunicorn app:app --bind 0.0.0.0:$PORT`.

