# ORBIO website

Static. No Python, no Flask, no build step.

## Run it locally

From this folder:

    python -m http.server 8080

Open http://127.0.0.1:8080/

In VS Code over Remote-SSH, open the Ports panel, find 8080 and click the globe icon.

## What is where

    index.html        the three pages (Project, Technology, Team), one file
    experiment/       the interactive virtual experiment
      index.html      was templates/virtual_experiment.html; its two data blobs
                      are now written into the page, so Flask is no longer needed
      css/ js/        unchanged copies of the original static/css and static/js

The experiment is embedded in the Project page, below the hero, through an
iframe, and also opens on its own at /experiment/.

## Updating the experiment data

The page carries two objects that used to come from app.py:

    window.ORBIO_REPOSITORY_OMICS   from data/outputs/omics/*/gravity_contrast.csv
    window.ORBIO_RUN_METADATA       from data/run_metadata.json

If a new run changes them, regenerate those two <script> lines near the top of
experiment/index.html. Everything else in the experiment is computed in the
browser and needs no server.

## Not included

The old src/, index.html and explore/ static pages were left out on purpose.

## Still to do

Site copy has not been verified by the team yet.

## When a new swiss-main drop arrives

Run the rebuild script, which re-applies every ORBIO customisation (palette,
white-disc wordmark, chart colours, chart sizing, hidden source lines, embedded
mode, mountain footer, iframe height reporting):

    python3 rebuild.py path/to/swiss-main path/to/new/orbio-web path/to/current/orbio-web

The site shell (index.html, assets/) is copied from the current build, so only
the experiment is refreshed.
