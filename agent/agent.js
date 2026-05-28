import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function reviewCode(filepath, code) {

  const systemPrompt = fs.readFileSync(
    path.join(__dirname, "../prompts/review_prompt.md"),
    "utf-8"
  );

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt
  });

  const result = await model.generateContent(
    `Please review this code from file: ${filepath}\n\n\`\`\`\n${code}\n\`\`\``
  );

  return result.response.text();
}

export async function reviewMultipleFiles(files) {
  const results = [];

  for (const file of files) {
    console.log(`Reviewing: ${file.filename}`);

    try {
      const report = await reviewCode(file.filename, file.code);

      // Extract score from report
      const match = report.match(/(\d+)\s*\/\s*10/);
      const score = match ? parseInt(match[1]) : 5;

      results.push({
        filename: file.filename,
        report,
        score,
        status: 'done'
      });

      if (files.indexOf(file) < files.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }

    } catch (err) {
      results.push({
        filename: file.filename,
        report: 'Error reviewing this file: ' + err.message,
        score: 0,
        status: 'error'
      });
    }
  }

  return results;
}