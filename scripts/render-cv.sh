#!/usr/bin/env bash
# Render content/cv.yaml to public/cv/cody-slater-cv.pdf with RenderCV.
# First run creates .venv (gitignored) and installs the pinned RenderCV.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x .venv/bin/rendercv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r scripts/cv-requirements.txt
fi

.venv/bin/rendercv render content/cv.yaml \
  --output-folder .cv-build \
  --pdf-path "$PWD/public/cv/cody-slater-cv.pdf" \
  --dont-generate-markdown --dont-generate-html --dont-generate-png
echo "wrote public/cv/cody-slater-cv.pdf"
