# https://docs.browser-use.com/quickstart
# Using real browser: https://docs.browser-use.com/customize/browser/real-browser

from browser_use import Agent, Browser, ChatOpenAI
from dotenv import load_dotenv
load_dotenv()

import asyncio


# Note: Make sure Chrome is completely closed before running this script
browser = Browser(
    executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    user_data_dir='/Users/amandavarella/Library/Application Support/Google/Chrome',
    profile_directory='Default', 
)

agent = Agent(
    task='Visit https://duckduckgo.com and search for "browser-use founders"',
    browser=browser,
    llm=ChatOpenAI(model='gpt-4.1-mini')
)

# main
async def main():
    result = await agent.run()
 
    print(result)

if __name__ == "__main__":
    asyncio.run(main())