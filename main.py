# https://docs.browser-use.com/quickstart
from browser_use import Agent, Browser, ChatOpenAI
from dotenv import load_dotenv
from pathlib import Path
load_dotenv()

import asyncio

# Read shopping list from file
shopping_list_path = Path(__file__).parent / "shopping-list.txt"
with open(shopping_list_path, "r", encoding="utf-8") as f:
    shopping_list_items = [line.strip() for line in f.readlines() if line.strip()]

# Create task that searches and adds all items from shopping list
shopping_list_text = "\n".join(f"- {item}" for item in shopping_list_items)
task = (
    f'Go to https://auth.woolworths.com.au/u/login, wait 30 seconds. '
    f'Then for each item in the following shopping list, search for it and add it to the cart:\n'
    f'{shopping_list_text}\n'
    f'After adding all items to the cart, call done but keep the browser open.'
)

browser = Browser(
	headless=False,  # Show browser window
    keep_alive=True,
)

agent = Agent(
    task=task,
    browser=browser,
    max_steps=200,  # Increased to allow for multiple items
    llm=ChatOpenAI(model='gpt-4o'),
)


# main
async def main():
    await agent.run()
    print("\n🌐 Browser is still open. Press Ctrl+C to close...")
    # Keep the script running indefinitely to maintain browser connection
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Closing browser...")


if __name__ == "__main__":
    asyncio.run(main())
