import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new McpServer({
  name: "code-reader",
  version: "1.0.0"
});

server.tool(
  "read_file",
  { filepath: z.string() },
  async ({ filepath }) => {
    try {
      const absolutePath = path.resolve(__dirname, "..", filepath);
      const content = fs.readFileSync(absolutePath, "utf-8");

      return {
        content: [{ type: "text", text: content }]
      };

    } catch (error) {
      return {
        content: [{ type: "text", text: `Error reading file: ${error.message}` }]
      };
    }
  }
);

server.tool(
  "list_files",
  { directory: z.string() },
  async ({ directory }) => {
    try {
      const absolutePath = path.resolve(__dirname, "..", directory);
      const files = fs.readdirSync(absolutePath);

      return {
        content: [{ type: "text", text: files.join("\n") }]
      };

    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing files: ${error.message}` }]
      };
    }
  }
);

server.tool(
  "read_multiple_files",
  { filepaths: z.array(z.string()) },
  async ({ filepaths }) => {
    try {
      const results = filepaths.map((filepath) => {
        const absolutePath = path.resolve(__dirname, "..", filepath);
        const content = fs.readFileSync(absolutePath, "utf-8");
        return `### File: ${filepath}\n\`\`\`\n${content}\n\`\`\``;
      });

      return {
        content: [{ type: "text", text: results.join("\n\n") }]
      };

    } catch (error) {
      return {
        content: [{ type: "text", text: `Error reading files: ${error.message}` }]
      };
    }
  }
);

server.tool(
  "file_exists",
  { filepath: z.string() },
  async ({ filepath }) => {
    try {
      const absolutePath = path.resolve(__dirname, "..", filepath);
      const exists = fs.existsSync(absolutePath);

      return {
        content: [{ type: "text", text: exists ? "true" : "false" }]
      };

    } catch (error) {
      return {
        content: [{ type: "text", text: `Error checking file: ${error.message}` }]
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("MCP Code Reader Server is running...");