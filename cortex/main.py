#!/usr/bin/env python3
"""
CORTEX: Self-Learning Superintelligence
Main entry point for CLI and API usage.
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from cortex.cli import main as cli_main

if __name__ == "__main__":
    cli_main()
