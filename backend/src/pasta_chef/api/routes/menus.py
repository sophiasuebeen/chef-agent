"""Public catalog from registered, usable recipe definitions."""
from fastapi import APIRouter
from pydantic import BaseModel
from pasta_chef.simulation.recipes import RECIPE_FILES, load_recipe

router = APIRouter()

class MenuResponse(BaseModel):
    id: str
    name: str
    ingredients: list[str]

@router.get("/menus", response_model=list[MenuResponse])
def get_menus():
    result = []
    for menu in RECIPE_FILES:
        try:
            recipe = load_recipe(menu)
        except (OSError, ValueError, UnicodeError):
            continue
        if not isinstance(recipe, dict):
            continue
        if (recipe.get("id") != menu or not isinstance(recipe.get("name"), str)
                or not recipe["name"].strip() or not recipe.get("tasks")
                or not recipe.get("completion_tasks") or not recipe.get("ingredients")
                or not isinstance(recipe["ingredients"], list)
                or not all(isinstance(i, str) and i.strip() for i in recipe["ingredients"])):
            continue
        result.append(dict(id=menu, name=recipe["name"], ingredients=recipe["ingredients"]))
    return result
