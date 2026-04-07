import json
from pathlib import Path
recipesPath = "c:\\Users\\dominic\\CodingProjects\\M&M\\website\\mmSite\\data\\recipes.json"
outPath = "c:\\Users\\dominic\\CodingProjects\\M&M\\website\\mmSite\\data\\items.json"
booksProperty = 'books'
recipesProperty = 'recipes'
recipesNameProperty = 'name'
recipeIdProperty = 'recipeId'
itemIdProperty = 'itemId'
itemNameProperty = 'item'

recipeInputsProperty = 'ingredients'
recipeOutputsProperty = 'results'

outputItemNameProperty = 'name'
outputItemIdProperty = 'itemId'
outputItemRecipeIdProperty = 'recipeIds'
outputItemRelatedRecipeIdsProperty = 'relatedRecipeIds'

def build_items_json():
    
    with open(recipesPath, 'r') as f:
        books = json.load(f)
    
    items = {}
    itemCount = 1
    
    # Extract unique items from recipes
    for book in books.get(booksProperty, []):
        for recipe in book.get(recipesProperty, []):
            recipeId = recipe.get(recipeIdProperty)
            recipeName = recipe.get(recipesNameProperty)
            
            # Check inputs
            for ingredient in recipe.get(recipeInputsProperty, []):
                itemId = ingredient.get(itemIdProperty)
                itemName = ingredient.get(itemNameProperty)
                if itemId and itemId not in items:
                    items[itemId] = {
                        outputItemNameProperty: itemName,
                        outputItemIdProperty: itemId,
                        outputItemRecipeIdProperty: [recipeId] if recipeId and recipeName == itemName else [],
                        outputItemRelatedRecipeIdsProperty: [recipeId] if recipeId and recipeName != itemName else []
                    }
                    itemCount += 1
                elif itemId and recipeId and recipeId not in items[itemId][outputItemRelatedRecipeIdsProperty]:
                    items[itemId][outputItemRecipeIdProperty].append(recipeId) if recipeName == itemName else None
                    items[itemId][outputItemRelatedRecipeIdsProperty].append(recipeId) if recipeId not in items[itemId][outputItemRecipeIdProperty] else None
            
            # Check outputs
            for result in recipe.get(recipeOutputsProperty, []):
                itemId = result.get(itemIdProperty)
                itemName = result.get(itemNameProperty)
                if itemId and itemId not in items:
                    items[itemId] = {
                        outputItemNameProperty: itemName,
                        outputItemIdProperty: itemId,
                        outputItemRecipeIdProperty: [recipeId] if recipeId and recipeName == itemName else [],
                        outputItemRelatedRecipeIdsProperty: [recipeId] if recipeId and recipeName != itemName else []
                    }
                    itemCount += 1
                elif itemId and recipeId and recipeId not in items[itemId][outputItemRelatedRecipeIdsProperty] and recipeId not in items[itemId][outputItemRecipeIdProperty]:
                    items[itemId][outputItemRecipeIdProperty].append(recipeId) if recipeName == itemName else None
                    items[itemId][outputItemRelatedRecipeIdsProperty].append(recipeId) if recipeId not in items[itemId][outputItemRecipeIdProperty] else None
    
    # Write items.json
    outputPath = Path(outPath)
    
    itemsList = list(items.values())
    
    with open(outputPath, 'w') as f:
        json.dump({'items': itemsList}, f, indent=2)
    
    print(f"Generated items.json with {len(itemsList)} unique items")

if __name__ == "__main__":
    build_items_json()