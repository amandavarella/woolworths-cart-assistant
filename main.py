# Shopping list extractor
from pathlib import Path

# Extract shopping list from Clove Kitchen groceries page
# Note: This functionality has been removed. 
# To extract shopping list items, manually visit https://clove.kitchen/groceries
# and copy the items to shopping-list.txt

shopping_list_path = Path("shopping-list.txt")

def main():
    print("Shopping list extractor")
    print(f"Shopping list file: {shopping_list_path}")
    if shopping_list_path.exists():
        print(f"Found {len(shopping_list_path.read_text().splitlines())} items in shopping list")
    else:
        print("Shopping list file not found. Please create shopping-list.txt")

if __name__ == "__main__":
    main()
