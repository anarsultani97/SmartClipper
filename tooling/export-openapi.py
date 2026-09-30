"""Export the API schema for generated frontend types."""

import json
from pathlib import Path

from smartclipper_api.app import app

path = Path("packages/contracts/openapi.json")
path.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
print(path)
