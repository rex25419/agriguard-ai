import sys
from pathlib import Path

# Add project root and ml directory to sys.path for Vercel Serverless environment
ROOT_DIR = Path(__file__).parent.parent
ML_DIR = ROOT_DIR / "ml"
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ML_DIR))

from ml.main import app
