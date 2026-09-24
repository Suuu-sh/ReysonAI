"""All authoring generators share the JS EV selection and checked equity table."""
import os
import subprocess
from pathlib import Path


def apply_call_policy(filename):
    root = Path(__file__).resolve().parents[1]
    subprocess.run(['node', str(root / 'scripts/apply-call-ev.mjs'), filename],
                   cwd=root, env=os.environ, check=True)
