#!/bin/bash
# LunaIDE Fast Fork — Build
# For the fast fork method, prepare.sh does all the work.
# This script just points to prepare.sh for compatibility.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/prepare.sh"
