import json
from pathlib import Path


RECIPE_DIR = Path(__file__).resolve().parent.parent / "recipes"

RECIPE_FILES = {
    "lemon_pasta": "lemon_pasta.json",
}


def load_recipe(menu: str) -> dict:
    """Load a recipe by its menu ID.

    Raises:
        ValueError: If the menu is unsupported.
        FileNotFoundError: If its recipe file is missing.
        json.JSONDecodeError: If the file contains invalid JSON.
    """
    if menu not in RECIPE_FILES:
        raise ValueError(f"Unknown menu: {menu}")

    recipe_path = RECIPE_DIR / RECIPE_FILES[menu]

    with recipe_path.open(encoding="utf-8") as file:
        return json.load(file)


def get_task(recipe: dict, task_id: str) -> dict:
    """Find a task within a loaded recipe.

    Raises:
        KeyError: If the task does not exist.
    """
    for task in recipe["tasks"]:
        if task["id"] == task_id:
            return task

    raise KeyError(
        f"Task '{task_id}' not found in recipe '{recipe['id']}'"
    )