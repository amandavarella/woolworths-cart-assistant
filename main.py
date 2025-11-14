# https://docs.browser-use.com/quickstart
from browser_use import Agent, Browser, ChatOpenAI
from dotenv import load_dotenv
from pathlib import Path
load_dotenv()

import asyncio

# Read shopping list from file
task='Visit https://duckduckgo.com and search for "browser-use founders"'

browser = Browser(
    executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    user_data_dir='~/Library/Application Support/Google/Chrome',
    profile_directory='Default',
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
