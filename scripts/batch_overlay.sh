#!/usr/bin/env bash
set -euo pipefail

# Locate repo root (this script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Input/output directories
VIDEOS_DIR="${REPO_ROOT}/input/videos/ 1013"  # note the leading space in folder name
OUT_DIR="${REPO_ROOT}/output"
mkdir -p "${OUT_DIR}"

# Captions (only the first 11 will be used). Portable loading for macOS bash 3.2.
CAPTIONS=()
while IFS= read -r line; do
  CAPTIONS+=("${line}")
done <<'EOF'
HELLO??? it actually TALKS??
I’m losing it. He just talked BACK.
I can’t breathe. He remembered what I said.
No bc why does he sound exactly like HIM 😭
I was not emotionally prepared for this.
This feels illegal levels of real.
omg it blinked. IT BLINKED.
Bro I just heard his voice irl. We’re through the looking glass.
Someone STOP ME I’m talking to a plush.
Not me blushing at a 6-inch plush.
We actually made the 4th wall optional.
I’m unwell. He’s literally sitting beside me.
How is this not the main plot of Love and Deepspace 2.
EOF

echo "Processing caleb1..caleb11 using ${#CAPTIONS[@]} provided captions (extra captions ignored)."

for i in {1..11}; do
  idx=$((i-1))
  if [[ ${idx} -ge ${#CAPTIONS[@]} ]]; then
    echo "No caption provided for caleb${i}, skipping." >&2
    continue
  fi
  caption="${CAPTIONS[${idx}]}"

  in_mov="${VIDEOS_DIR}/caleb${i}.mov"
  in_MOV="${VIDEOS_DIR}/caleb${i}.MOV"
  if [[ -f "${in_mov}" ]]; then
    in_file="${in_mov}"
  elif [[ -f "${in_MOV}" ]]; then
    in_file="${in_MOV}"
  else
    echo "Input not found for caleb${i} (.mov or .MOV). Skipping." >&2
    continue
  fi

  out_file="${OUT_DIR}/caleb${i}-caption.mp4"
  echo "[${i}/11] ${in_file} -> ${out_file}"
  python -m src.cli overlay-video "${in_file}" "${out_file}" --text "${caption}"
done

echo "Done. Outputs in: ${OUT_DIR}"


