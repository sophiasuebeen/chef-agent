import json
from pathlib import Path


RECIPE_DIR = Path(__file__).resolve().parent.parent / "recipes"

RECIPE_FILES = {
    "lemon_pasta": "lemon_pasta.json",
    "seafood_tomato": "seafood_tomato.json",
}


_parsed = {}


def load_recipe(menu: str) -> dict:
    """Load a recipe by its menu ID. The result is shared between callers: treat it as read-only.

    Validation reads recipes constantly, so a file is parsed again only after it changes.

    Raises:
        ValueError: If the menu is unsupported.
        FileNotFoundError: If its recipe file is missing.
        json.JSONDecodeError: If the file contains invalid JSON.
    """
    if menu not in RECIPE_FILES:
        raise ValueError(f"Unknown menu: {menu}")

    recipe_path = RECIPE_DIR / RECIPE_FILES[menu]

    status = recipe_path.stat()
    version = (status.st_mtime_ns, status.st_size)
    cached = _parsed.get(recipe_path)
    if cached and cached[0] == version:
        return cached[1]
    with recipe_path.open(encoding="utf-8") as file:
        recipe = json.load(file)
    _parsed[recipe_path] = (version, recipe)
    return recipe


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