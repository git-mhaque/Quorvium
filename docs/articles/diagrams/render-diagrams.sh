#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DIAGRAM_DIR="${ROOT_DIR}/docs/articles/diagrams"

render() {
  local input_file="$1"
  local output_file="$2"

  curl --fail --silent --show-error \
    --request POST \
    --header "Content-Type: text/plain" \
    --data-binary "@${DIAGRAM_DIR}/${input_file}" \
    "https://kroki.io/mermaid/svg" \
    --output "${DIAGRAM_DIR}/${output_file}"
}

render "ai_native-sdlc.mmd" "ai_native-sdlc.svg"

echo "Rendered SVG diagrams to ${DIAGRAM_DIR}"
