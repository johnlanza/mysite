const fs = require("fs");
const MarkdownIt = require("markdown-it");
const path = require("path");
const app = express();
const md = new MarkdownIt();

//Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, "index.html");
  // console.log("Serving file from:", indexPath); // Debug log
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error("Error sending file:", err);
      res.status(500).send("Internal Server Error");
    }
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/booknotes/:file", (req, res) => {
  const filePath = path.join(__dirname, "booknotes", `${req.params.file}.md`);
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) return res.status(404).send("File not found");

    // Debug original Markdown data
    // console.log("Original Markdown Data:\n", data);

    // Apply regex to remove references with specific indentation
    const cleanedData = data.replace(
      /^- Yellow highlight \| Location: \d+\n\t {2}.*(\n)?/gm,
      ""
    );

    // Debug cleaned Markdown data
    console.log("Cleaned Markdown Data:\n", cleanedData);

    // Render Markdown
    const htmlContent = md.render(cleanedData);
    res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <link rel="stylesheet" href="/styles/app.css">
              <title>${req.params.file.replace("-", " ")}</title>
          </head>
          <body>
              <div class="booknote-content">${htmlContent}</div>
          </body>
          </html>
      `);
  });
});

app.use("/styles", express.static(path.join(__dirname, "styles")));
