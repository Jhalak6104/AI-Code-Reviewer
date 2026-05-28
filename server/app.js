import express  from "express";
import multer   from "multer";
import fs       from "fs";
import path     from "path";
import https from "https";
import { fileURLToPath } from "url";
import { reviewCode, reviewMultipleFiles } from "../agent/agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app    = express();
const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const HISTORY_FILE = path.join(__dirname, "../data/history.json");
const OUTPUT_DIR   = path.join(__dirname, "../output");

function readHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8").trim();
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  try {
    const history = readHistory();
    history.unshift(entry);
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error("Failed to save history:", err.message);
  }
}

function generateSummary(results) {
  const avg   = (results.reduce((a, b) => a + b.score, 0) / results.length).toFixed(1);
  const worst = [...results].sort((a, b) => a.score - b.score)[0];
  const best  = [...results].sort((a, b) => b.score - a.score)[0];

  let md  = `# Folder Review Summary\n\n`;
  md     += `**Total Files:** ${results.length}\n`;
  md     += `**Average Score:** ${avg}/10\n`;
  md     += `**Best File:** ${best.filename} (${best.score}/10)\n`;
  md     += `**Needs Most Work:** ${worst.filename} (${worst.score}/10)\n\n`;
  md     += `---\n\n`;

  results.forEach(r => {
    md += `## ${r.filename} — ${r.score}/10\n\n`;
    md += r.report + "\n\n---\n\n";
  });

  return md;
}

app.post("/api/review", upload.single("file"), async (req, res) => {
  try {
    let code     = "";
    let filename = "pasted-code.js";

    if (req.file) {
      code     = fs.readFileSync(req.file.path, "utf-8");
      filename = req.file.originalname;
      fs.unlinkSync(req.file.path);
    } else if (req.body.code) {
      code     = req.body.code;
      filename = req.body.filename || "pasted-code.js";
    }

    if (!code) {
      return res.status(400).json({ error: "No code provided" });
    }

    console.log(`Reviewing: ${filename}`);
    const report = await reviewCode(filename, code);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputFile = `review_${Date.now()}.md`;
    const outputPath = path.join(OUTPUT_DIR, outputFile);
    fs.writeFileSync(outputPath, report);

    const scoreMatch = report.match(/(\d+)\s*\/\s*10/);
    const score      = scoreMatch ? parseInt(scoreMatch[1]) : null;

    saveToHistory({
      id:         Date.now(),
      filename,
      score,
      report,
      type:       "single",
      time:       new Date().toISOString(),
      outputFile
    });

    res.json({ success: true, report, filename, outputPath: outputFile });

  } catch (error) {
    console.error("Review error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/review-folder", upload.array("files", 30), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const supported = [
      ".js", ".ts", ".py", ".java", ".cpp",
      ".cs", ".go", ".rb", ".php", ".jsx", ".tsx"
    ];

    const files = req.files
      .filter(f => {
        const ext = "." + f.originalname.split(".").pop().toLowerCase();
        return supported.includes(ext);
      })
      .map(f => ({
        filename: f.originalname,
        code:     fs.readFileSync(f.path, "utf-8"),
        path:     f.path
      }));

    if (files.length === 0) {
      return res.status(400).json({ error: "No supported code files found" });
    }

    console.log(`Reviewing ${files.length} files...`);
    const results = await reviewMultipleFiles(files);

    req.files.forEach(f => {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    });

    const summary        = generateSummary(results);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const folderOutputFile = `folder_review_${Date.now()}.md`;
    const summaryPath      = path.join(OUTPUT_DIR, folderOutputFile);
    fs.writeFileSync(summaryPath, summary);

    results.forEach(r => {
      saveToHistory({
        id:         Date.now() + Math.random(),
        filename:   r.filename,
        score:      r.score,
        report:     r.report,
        type:       "folder",
        time:       new Date().toISOString(),
        outputFile: folderOutputFile
      });
    });

    res.json({ success: true, results, summary, summaryPath: folderOutputFile });

  } catch (error) {
    console.error("Folder review error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/history", (req, res) => {
  try {
    const history = readHistory();

    if (fs.existsSync(OUTPUT_DIR)) {
      const mdFiles = fs.readdirSync(OUTPUT_DIR)
        .filter(f => f.endsWith(".md"));

      const trackedFiles = new Set(
        history.map(h => h.outputFile).filter(Boolean)
      );

      let synced = 0;

      mdFiles.forEach(mdFile => {
        if (trackedFiles.has(mdFile)) return;

        try {
          const filePath = path.join(OUTPUT_DIR, mdFile);
          const content  = fs.readFileSync(filePath, "utf-8");

          const scoreMatch = content.match(/(\d+)\s*\/\s*10/);
          const score      = scoreMatch ? parseInt(scoreMatch[1]) : null;

          const nameMatch = content.match(/\*\*File:\*\*\s*(.+)/);
          const filename  = nameMatch
            ? nameMatch[1].trim()
            : mdFile
                .replace(/^review_/, "")
                .replace(/^folder_review_/, "folder_")
                .replace(/_\d+\.md$/, "");

          const type = mdFile.startsWith("folder_") ? "folder" : "single";

          const tsMatch = mdFile.match(/_(\d{10,13})/);
          const time    = tsMatch
            ? new Date(parseInt(tsMatch[1])).toISOString()
            : new Date().toISOString();

          const entry = {
            id:         parseInt(tsMatch?.[1]) || Date.now(),
            filename,
            score,
            report:     content,
            type,
            time,
            outputFile: mdFile
          };

          history.push(entry);
          synced++;

          console.log(`Synced from output/: ${mdFile}`);

        } catch (readErr) {
          console.error(`Skipping ${mdFile}:`, readErr.message);
        }
      });

      if (synced > 0) {
        history.sort((a, b) => new Date(b.time) - new Date(a.time));
        fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        console.log(`Synced ${synced} file(s) from output/ into history`);
      }
    }

    res.json({ success: true, history });

  } catch (err) {
    console.error("History fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/history", (req, res) => {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));

    let deletedCount = 0;

    if (fs.existsSync(OUTPUT_DIR)) {
      const files = fs.readdirSync(OUTPUT_DIR);

      files.forEach(file => {
        const filePath = path.join(OUTPUT_DIR, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });
    }

    console.log(`Cleared history + deleted ${deletedCount} file(s) from output/`);

    res.json({
      success: true,
      message: `History cleared and ${deletedCount} output file(s) deleted.`
    });

  } catch (err) {
    console.error("History clear error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

function githubGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent":  "ai-code-reviewer",
        "Accept":      "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN && {
          "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`
        })
      }
    };

    https.get(url, options, (res) => {
      let data = "";
      res.on("data",  chunk => data += chunk);
      res.on("end",   ()    => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON from GitHub")); }
      });
    }).on("error", reject);
  });
}

async function getRepoFiles(owner, repo, branch = "main", dirPath = "") {
  const url      = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;
  const contents = await githubGet(url);

  if (!Array.isArray(contents)) {
    if (branch === "main") {
      return getRepoFiles(owner, repo, "master", dirPath);
    }
    throw new Error(contents.message || "Could not fetch repo contents");
  }

  const supported = [
    ".js", ".ts", ".py", ".java", ".cpp",
    ".cs", ".go", ".rb", ".php", ".jsx", ".tsx"
  ];

  let files = [];

  for (const item of contents) {
    const skipDirs = ["node_modules", ".git", "dist", "build", ".next", "vendor"];
    if (item.type === "dir") {
      if (skipDirs.includes(item.name)) continue;
      const subFiles = await getRepoFiles(owner, repo, branch, item.path);
      files = files.concat(subFiles);
    } else if (item.type === "file") {
      const ext = "." + item.name.split(".").pop().toLowerCase();
      if (supported.includes(ext) && item.size < 50000) { // skip files > 50KB
        files.push({ name: item.name, path: item.path, downloadUrl: item.download_url });
      }
    }
  }

  return files;
}

app.post("/api/review-github", async (req, res) => {
  try {
    const { repoUrl } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: "No GitHub URL provided" });
    }

    const match = repoUrl.match(
      /github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/
    );

    if (!match) {
      return res.status(400).json({
        error: "Invalid GitHub URL. Use: https://github.com/owner/repo"
      });
    }

    const owner  = match[1];
    const repo   = match[2].replace(".git", "");
    const branch = match[3] || "main";

    console.log(`Fetching repo: ${owner}/${repo} (${branch})`);

    let repoFiles;
    try {
      repoFiles = await getRepoFiles(owner, repo, branch);
    } catch (err) {
      return res.status(400).json({ error: "Could not access repo: " + err.message });
    }

    if (repoFiles.length === 0) {
      return res.status(400).json({ error: "No supported code files found in this repo" });
    }

    if (repoFiles.length > 10) {
      console.log(`Found ${repoFiles.length} files — limiting to 10`);
      repoFiles = repoFiles.slice(0, 10);
    }

    console.log(`Found ${repoFiles.length} files to review`);

    const files = [];
    for (const f of repoFiles) {
      try {
        const content = await new Promise((resolve, reject) => {
          https.get(f.downloadUrl, { headers: { "User-Agent": "ai-code-reviewer" } }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end",  ()    => resolve(data));
          }).on("error", reject);
        });

        files.push({ filename: f.path, code: content });
        console.log(`Downloaded: ${f.path}`);

      } catch (err) {
        console.error(`Skipping ${f.path}:`, err.message);
      }
    }

    if (files.length === 0) {
      return res.status(400).json({ error: "Could not download any files from the repo" });
    }

    console.log(`Reviewing ${files.length} files...`);
    const results = await reviewMultipleFiles(files);

    // Save summary to output folder
    const summary          = generateSummary(results);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const githubOutputFile = `github_review_${Date.now()}.md`;
    const summaryPath      = path.join(OUTPUT_DIR, githubOutputFile);
    fs.writeFileSync(summaryPath, summary);

    // Save to history
    results.forEach(r => {
      saveToHistory({
        id:         Date.now() + Math.random(),
        filename:   r.filename,
        score:      r.score,
        report:     r.report,
        type:       "github",
        repo:       `${owner}/${repo}`,
        time:       new Date().toISOString(),
        outputFile: githubOutputFile
      });
    });

    res.json({
      success: true,
      results,
      summary,
      repo:    `${owner}/${repo}`,
      branch,
      totalFilesFound: repoFiles.length
    });

  } catch (error) {
    console.error("GitHub review error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
  console.log("Output folder : ./output");
  console.log("History file  : ./data/history.json");
});