# https://docs.browser-use.com/quickstart
from browser_use import Agent, Browser, ChatOpenAI
from dotenv import load_dotenv
load_dotenv()

import asyncio

browser = Browser(
	headless=False,  # Show browser window
    keep_alive=True,
)

agent = Agent(
    task=(
      'Go to https://auth.woolworths.com.au/u/login, wait 30 seconds, '
      'search for "a2 milk 3L", click any "Add to cart" button once, then call done but keep the browser open.'
    ),
    browser=browser,
    max_steps=8,
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
