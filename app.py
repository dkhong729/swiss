import csv
import json
import os
from pathlib import Path

from flask import Flask, render_template

app = Flask(__name__)
APP_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = APP_ROOT.parent
DATA_ROOT = APP_ROOT / "data"


def load_run_metadata():
    bundled_metadata = DATA_ROOT / "run_metadata.json"
    if bundled_metadata.is_file():
        with bundled_metadata.open(encoding="utf-8") as source:
            return json.load(source)

    candidates = [
        REPOSITORY_ROOT / "outputs" / "pipeline_corrected_v2" / "summary.json",
        REPOSITORY_ROOT / "outputs" / "omics_calibrated" / "summary.json",
        REPOSITORY_ROOT / "outputs" / "pipeline_480" / "summary.json",
        REPOSITORY_ROOT / "outputs" / "pipeline" / "summary.json",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        with path.open(encoding="utf-8") as source:
            summary = json.load(source)
        provenance = summary.get("provenance", {})
        profile = summary.get("profile") or provenance.get("profile")
        if not profile:
            continue
        physics = provenance.get("physics", {})
        cells = physics.get("cells", {})
        gpu = summary.get("gpu", {})
        quality = summary.get("simulation_quality", {})
        attempted = quality.get("total", profile.get("n_scenarios"))
        capped = quality.get("capped")
        return {
            "available": True,
            "source": path.relative_to(REPOSITORY_ROOT).as_posix(),
            "profile": profile,
            "gpu": {
                "name": gpu.get("name"),
                "vramGb": gpu.get("vram_gb"),
                "torch": gpu.get("torch") or provenance.get("environment", {}).get("torch"),
                "cudaBuild": gpu.get("cuda_build"),
                "computeCapability": gpu.get("capability"),
                "architecture": gpu.get("arch_list", []),
                "bf16": gpu.get("bf16"),
            },
            "quality": {
                "attempted": attempted,
                "capped": capped,
                "retained": attempted - capped if isinstance(attempted, int) and isinstance(capped, int) else None,
                "policy": quality.get("policy") or provenance.get("cap_policy"),
                "scopeNote": "Metrics describe the uncensored subset; cap exclusions may change the scenario distribution.",
            },
            "physics": {
                "gridSide": profile.get("grid_n"),
                "voxelSizeUm": profile.get("grid_h"),
                "jacobiIterations": physics.get("grid_defaults", {}).get("jacobi_iters"),
                "d_o2": physics.get("fields", {}).get("D_o2"),
                "d_glc": physics.get("fields", {}).get("D_glc"),
                "o2Hypoxic": cells.get("o2_hypoxic"),
                "o2ProliferationSaturation": cells.get("o2_prolif_sat"),
                "o2Necrotic": cells.get("o2_necrotic"),
                "glucoseMinimum": cells.get("glc_min"),
                "cycleHours": cells.get("cycle_h"),
                "simulationStepHours": 1.0,
            },
            "initialization": {
                "datasetMinimumAgents": 100,
                "datasetMaximumAgents": 160,
                "scenarioDefaultAgents": 120,
                "source": "orbio/data.py dataset generator and orbio/config.py Scenario.n0",
            },
            "architecture": {
                "encoder": "GNN / kNN EdgeConv",
                "inputFeatures": 12,
                "nearestNeighbours": 10,
                "embeddingDimensions": 64,
                "pretraining": "Contrastive NT-Xent",
            },
        }
    return {
        "available": False,
        "source": None,
        "profile": {},
        "gpu": {},
        "quality": {},
        "physics": {},
        "initialization": {
            "datasetMinimumAgents": 100,
            "datasetMaximumAgents": 160,
            "scenarioDefaultAgents": 120,
            "source": "orbio/data.py dataset generator and orbio/config.py Scenario.n0",
        },
        "architecture": {
            "encoder": "GNN / kNN EdgeConv",
            "inputFeatures": 12,
            "nearestNeighbours": 10,
            "embeddingDimensions": 64,
            "pretraining": "Contrastive NT-Xent",
        },
    }


def load_omics_contrasts():
    sources = [
        (
            "neural",
            "flight_ug",
            "outputs/omics/flight_v2/gravity_contrast.csv",
            DATA_ROOT / "outputs" / "omics" / "flight_v2" / "gravity_contrast.csv",
            REPOSITORY_ROOT / "outputs" / "omics" / "flight_v2" / "gravity_contrast.csv",
            "flight_ug vs ground_1g",
            "Paired biological units (n=4 pairs); combined transcriptome score.",
        ),
        (
            "crc_tumor_organoid",
            "sim_ug_clinostat",
            "outputs/omics/crc/gravity_contrast.csv",
            DATA_ROOT / "outputs" / "omics" / "crc" / "gravity_contrast.csv",
            REPOSITORY_ROOT / "outputs" / "omics" / "crc" / "gravity_contrast.csv",
            "sim_ug_clinostat vs ground_1g",
            "Clinostat organoid contrast (n=4 per arm); combined score.",
        ),
    ]
    result = {}
    for tissue, gravity, source_file, bundled_path, repository_path, contrast, detail in sources:
        path = bundled_path if bundled_path.is_file() else repository_path
        if not path.is_file():
            continue
        programs = {}
        with path.open(newline="", encoding="utf-8-sig") as source:
            for row in csv.DictReader(source):
                if row.get("layer") != "combined":
                    continue
                program = row["program"]
                programs[program] = {
                    "delta": float(row["delta"]),
                    "sd": float(row["sd"]),
                    "n": int(row.get("n_pairs") or row.get("n_ug") or 0),
                }
        if programs:
            result.setdefault(tissue, {})[gravity] = {
                "programs": programs,
                "sourceFile": source_file,
                "contrast": contrast,
                "detail": detail,
            }
    return result


@app.get("/")
def virtual_experiment():
    return render_template(
        "virtual_experiment.html",
        omics_data=load_omics_contrasts(),
        run_metadata=load_run_metadata(),
    )


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "5000")), debug=False)
