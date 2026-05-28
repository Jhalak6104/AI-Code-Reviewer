# 🤖 AI Code Reviewer

A full-stack AI-powered code review tool.
Built with Node.js, Express, and Google Gemini API.

## Features

- **Single File Review** — paste or upload any code file
- **Folder Review** — review entire projects at once
- **GitHub Integration** — paste any public GitHub repo URL
- **Score History** — track code quality over time with charts

## Tech Stack

- **Backend:** Node.js, Express.js
- **AI:** Google Gemini 2.5 Flash API
- **Frontend:** Vanilla JS, Chart.js
- **Architecture:** MCP Server, Agent Pattern, Markdown Prompt Design

## Setup

1. Clone the repo
   git clone https://github.com/Jhalak6104/AI-Code-Reviewer

   cd ai-code-reviewer

2. Install dependencies

   npm install

3. Create .env file

   GEMINI_API_KEY=your_gemini_api_key_here

4. Run the app

   npm start

5. Open http://localhost:3000

## Project Structure

ai-code-reviewer/

├── server/app.js          # Express backend

├── agent/agent.js         # AI agent logic

├── prompts/               # Markdown prompt architecture

├── public/                # Frontend (HTML, CSS, JS)

├── sample-code/           # Test files

└── mcp-server/            # MCP server