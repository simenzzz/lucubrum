#!/usr/bin/env python3
"""Generate JSON schemas from Pydantic models.

This script exports JSON Schema files from the Pydantic models in the
curriculum-python service to the packages/contracts/schemas directory.

Usage:
    python scripts/generate-schemas.py
"""

import json
import sys
from pathlib import Path

# Add the curriculum-python src to path
curriculum_src = Path(__file__).parent.parent / "apps" / "curriculum-python" / "src"
sys.path.insert(0, str(curriculum_src))

from models.transcript import Transcript, VideoValidation, StalenessResult
from models.plan import Plan
from models.exercise import ExerciseSet
from models.grade import Grade
from models.query_suggestions import QuerySuggestions


def write_schema(model_class, output_name: str, output_dir: Path) -> None:
    """Write a Pydantic model's JSON schema to a file."""
    schema = model_class.model_json_schema()
    output_path = output_dir / f"{output_name}.schema.json"

    with open(output_path, "w") as f:
        json.dump(schema, f, indent=2)
        f.write("\n")

    print(f"Generated: {output_path}")


def main():
    output_dir = Path(__file__).parent.parent / "packages" / "contracts" / "schemas"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Map of models to their output names
    models = {
        "transcript.v1": Transcript,
        "video_validation.v1": VideoValidation,
        "staleness_result.v1": StalenessResult,
        "plan.v1": Plan,
        "exercise_set.v1": ExerciseSet,
        "grade.v1": Grade,
        "query_suggestions.v1": QuerySuggestions,
    }

    for name, model_class in models.items():
        try:
            write_schema(model_class, name, output_dir)
        except Exception as e:
            print(f"Error generating schema for {name}: {e}")

    print(f"\nAll schemas generated in {output_dir}")


if __name__ == "__main__":
    main()
