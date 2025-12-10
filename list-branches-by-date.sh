#!/bin/bash
set -euo pipefail

# Script to list git branches sorted by committer date
# This helps identify recently active branches and find stale ones

echo "Branches sorted by most recent commit date:"
echo "============================================="
git for-each-ref --sort=-committerdate --format='%(refname:short): %(committerdate:short)' refs/heads/
