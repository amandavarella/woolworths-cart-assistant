# Woolworths Cart Assistant

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

1. Add your shopping items to `shopping-list.txt` (one item per line)

2. Run the agent:
```bash
python main.py
```

The agent will:
1. Navigate to the Woolworths login page
2. Wait for user interaction (30 seconds for manual login)
3. Read all items from `shopping-list.txt`
4. Search for each item
5. Add all items to the cart
6. Keep the browser open for manual checkout

Press `Ctrl+C` to close the browser when done.

## Configuration

### Shopping List

Edit `shopping-list.txt` to add or modify items. Each line should contain one product name:
```
a2 Milk Full Cream Milk 3L
Inside Out Almond Milk Unsweetened 1L
Devondale Shredded Mozzarella Cheese 600g
```

### Code Configuration

Edit `main.py` to customize:
- `max_steps`: Maximum number of steps before stopping (default: 200)
- `llm`: Model to use (default: gpt-4o)
- `headless`: Set to `True` in Browser config to run without visible browser window

## How It Works

The agent:
- Reads items from `shopping-list.txt` at startup
- Dynamically generates a task with all items from the file
- Searches for each item on Woolworths website
- Adds each item to the cart automatically
- Keeps the browser open for you to complete checkout

## Notes

- GPT-4o provides better reasoning and fewer loops than mini models
- `max_steps` parameter prevents infinite retry loops
- `keep_alive=True` maintains browser connection after task completion
