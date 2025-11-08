# Agent Web Base

Browser automation agent using [browser-use](https://github.com/browser-use/browser-use) library with GPT-4o for intelligent web interactions.

## Features

- Automated browser navigation with AI-driven decision making
- Persistent browser sessions with `keep_alive` mode
- Configurable step limits to prevent infinite loops
- Support for complex multi-step tasks

## Getting Started

**Option 1: LLM-Assisted Configuration**

Simply ask your AI assistant:
```
Help me get started with Browser Use
```

**Option 2: Manual Setup**

1. Install dependencies:
```bash
pip install browser-use openai python-dotenv
```

2. Create a `.env` file with your OpenAI API key:
```bash
OPENAI_API_KEY=your_key_here
```

## Usage

Run the agent:
```bash
python main.py
```

The agent will:
1. Navigate to the specified website
2. Wait for user interaction (30 seconds for login)
3. Search for products
4. Add items to cart
5. Keep the browser open for manual interaction

Press `Ctrl+C` to close the browser when done.

## Configuration

Edit `main.py` to customize:
- `task`: The instruction for the agent
- `max_steps`: Maximum number of steps before stopping (default: 8)
- `llm`: Model to use (default: gpt-4o)
- `headless`: Set to `True` to run without visible browser window

## Example Task

Current configuration demonstrates automated shopping:
- Login to Woolworths
- Search for "a2 milk 3L"
- Add product to cart
- Keep browser open for checkout

## Notes

- GPT-4o provides better reasoning and fewer loops than mini models
- `max_steps` parameter prevents infinite retry loops
- `keep_alive=True` maintains browser connection after task completion
