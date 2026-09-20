#!/bin/bash
# scan-new-files.sh — Scans repo for source files not listed in file-map.md
# Usage: bash scripts/scan-new-files.sh [--update]
# --update flag appends missing files to file-map.md under "## Uncategorized (New)" section

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE_MAP="$HOME/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/file-map.md"

if [ ! -f "$FILE_MAP" ]; then
  echo "ERROR: file-map.md not found at $FILE_MAP"
  exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Directories to scan (service → glob pattern)
declare -a SCAN_DIRS=(
  "packages/figma-plugin/src:ts,tsx,css"
  "packages/api/src:ts"
  "packages/browser-extension/src:ts,tsx"
  "packages/web/src:ts,tsx"
  "packages/shared/src:ts"
)

# Files/dirs to exclude
EXCLUDE_PATTERN="node_modules|dist|build|\.d\.ts$|\.css\.d\.ts$|vite-env|__pycache__|\.map$"

missing_count=0
missing_files=""

echo -e "${CYAN}=== Web2Wireframe File Map Scanner ===${NC}"
echo -e "Scanning repo: ${REPO_ROOT}"
echo -e "File map: ${FILE_MAP}"
echo ""

for entry in "${SCAN_DIRS[@]}"; do
  IFS=':' read -r dir extensions <<< "$entry"
  full_dir="$REPO_ROOT/$dir"

  if [ ! -d "$full_dir" ]; then
    echo -e "${YELLOW}SKIP: $dir (directory not found)${NC}"
    continue
  fi

  echo -e "${CYAN}── Scanning $dir ──${NC}"

  # Build find command with extensions
  find_args=()
  IFS=',' read -ra exts <<< "$extensions"
  for i in "${!exts[@]}"; do
    if [ $i -gt 0 ]; then
      find_args+=("-o")
    fi
    find_args+=("-name" "*.${exts[$i]}")
  done

  service_missing=0

  while IFS= read -r file; do
    # Get relative path from repo root
    rel_path="${file#$REPO_ROOT/}"

    # Skip excluded patterns
    if echo "$rel_path" | grep -qE "$EXCLUDE_PATTERN"; then
      continue
    fi

    # Skip index.ts re-export files (usually just barrel exports)
    basename_file=$(basename "$file")
    if [ "$basename_file" = "index.ts" ] || [ "$basename_file" = "index.tsx" ]; then
      # Only skip if it's a simple re-export (< 5 lines)
      line_count=$(wc -l < "$file" | tr -d ' ')
      if [ "$line_count" -lt 5 ]; then
        continue
      fi
    fi

    # Check if file is in file-map
    # Use the relative path without leading ./
    if ! grep -qF "$rel_path" "$FILE_MAP"; then
      echo -e "  ${RED}NEW:${NC} $rel_path"
      missing_files="${missing_files}\n- \`${rel_path}\`"
      missing_count=$((missing_count + 1))
      service_missing=$((service_missing + 1))
    fi
  done < <(find "$full_dir" -type f \( "${find_args[@]}" \) | sort)

  if [ $service_missing -eq 0 ]; then
    echo -e "  ${GREEN}✓ All files tracked${NC}"
  else
    echo -e "  ${YELLOW}→ $service_missing new file(s)${NC}"
  fi
  echo ""
done

echo -e "${CYAN}════════════════════════════════════${NC}"
if [ $missing_count -eq 0 ]; then
  echo -e "${GREEN}✓ File map is up to date! No new files found.${NC}"
else
  echo -e "${YELLOW}⚠ Found $missing_count file(s) not in file-map.md${NC}"

  # If --update flag, append to file-map
  if [ "$1" = "--update" ]; then
    echo "" >> "$FILE_MAP"
    echo "## Uncategorized (New Files — needs sorting)" >> "$FILE_MAP"
    echo "" >> "$FILE_MAP"
    echo -e "$missing_files" | while IFS= read -r line; do
      [ -n "$line" ] && echo "$line" >> "$FILE_MAP"
    done
    echo -e "${GREEN}✓ Appended $missing_count files to file-map.md under 'Uncategorized' section${NC}"
    echo -e "${YELLOW}→ Please sort them into appropriate categories${NC}"
  else
    echo -e "Run with ${GREEN}--update${NC} to append missing files to file-map.md"
  fi
fi
