#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIAGRAM_DIR="${ROOT_DIR}/docs/diagrams"
PUPPETEER_CONFIG="$(mktemp /tmp/quorvium-mermaid-puppeteer.XXXXXX.json)"

cleanup() {
  rm -f "${PUPPETEER_CONFIG}"
}
trap cleanup EXIT

cat > "${PUPPETEER_CONFIG}" <<'JSON'
{
  "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "args": ["--no-sandbox", "--disable-setuid-sandbox"]
}
JSON

render() {
  local input_file="$1"
  local output_file="$2"

  PUPPETEER_SKIP_DOWNLOAD=1 NPM_CONFIG_CACHE=/tmp/npm-cache \
    npx -y @mermaid-js/mermaid-cli \
    -p "${PUPPETEER_CONFIG}" \
    -i "${DIAGRAM_DIR}/${input_file}" \
    -o "${DIAGRAM_DIR}/${output_file}"
}

render "runtime-staging.mmd" "runtime-staging.svg"
render "artifact-promotion.mmd" "artifact-promotion.svg"

echo "Rendered SVG diagrams to ${DIAGRAM_DIR}" 
