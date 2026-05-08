import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_DIRECTORIES = [
  {
    type: "journals",
    dir: "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/journals",
  },
  {
    type: "pages",
    dir: "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/pages",
  },
];

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT_FILE = path.join(ROOT, "src/data/questions.json");
const MY_QUESTIONS_PATTERN = /#?\[\[My Questions\]\]/i;
const TAG_PATTERN = /(?:^|\s)#(?:\[\[([^\]]+)\]\]|([a-zA-Z0-9/_-]+))/g;
const MY_QUESTIONS_PAGE_NAME = "My Questions";

function decodeFileName(fileName) {
  return decodeURIComponent(fileName.replace(/\.md$/i, ""));
}

function cleanupInlineMarkup(value) {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, " ")
    .replace(/\{\{renderer [^}]+\}\}/g, " ")
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/(?:\*\*|__|`|~~)/g, "")
    .replace(/(?:==|\^\^)/g, "")
    .replace(/\b[a-z-]+::/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTags(text) {
  const tags = new Set();

  for (const match of text.matchAll(TAG_PATTERN)) {
    const tag = (match[1] ?? match[2] ?? "").trim().toLowerCase();

    if (!tag || tag === "my questions") {
      continue;
    }

    tags.add(tag);
  }

  return [...tags].sort();
}

function extractSourceLocator(line) {
  const match = line.match(/\bLocation:\s*([0-9,.-]+)/i);
  return match ? `Location ${match[1]}` : null;
}

function sourceDisplayFor(originType, originFile) {
  const pageTitle = decodeFileName(originFile);

  if (originType === "journals") {
    return pageTitle;
  }

  return pageTitle.split(" | ")[0]?.trim() ?? pageTitle;
}

function isMyQuestionsPage(originType, originFile) {
  return originType === "pages" && decodeFileName(originFile) === MY_QUESTIONS_PAGE_NAME;
}

function stripQuestionMarkers(line) {
  return cleanupInlineMarkup(
    line
      .replace(MY_QUESTIONS_PATTERN, " ")
      .replace(TAG_PATTERN, " ")
      .replace(/\[\[[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4}\]\]/g, " ")
      .replace(/^[\s>*-]+/, " ")
      .replace(/\s+/g, " "),
  );
}

function extractQuestionSentences(text) {
  const quotedQuestions = [
    ...text.matchAll(/[“"]([^“”"]+\?[^”"]*)/g),
  ]
    .map((match) => cleanupInlineMarkup(match[1] ?? "").trim())
    .filter(Boolean);

  if (quotedQuestions.length > 0) {
    return quotedQuestions.join(" ");
  }

  const questions = text.match(/[^?]+\?/g);

  if (!questions || questions.length === 0) {
    return null;
  }

  return cleanupInlineMarkup(questions.join(" ")).trim() || null;
}

function formatQuestionText(text) {
  const cleaned = text
    .replace(/^[:\s"'“”]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return cleaned;
  }

  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

function cleanupQuestionText(line) {
  let stripped = stripQuestionMarkers(line)
    .replace(/^Note:\s*/i, "")
    .replace(/^DONE\s+/i, "")
    .replace(/^Good\s+/i, "")
    .replace(/^Questions?\s+for[^:]*:\s*/i, "")
    .replace(/^The question I need to continue to ask and respond to is\s*/i, "")
    .replace(/^The question I need to answer is\s*/i, "")
    .replace(/^From [^.]+,\s*I should ask myself,\s*/i, "")
    .replace(/^One night the topic was:\s*/i, "")
    .replace(/^Roll the dice for the icebreaker question:\s*/i, "")
    .replace(/^Pulling from\s*/i, "")
    .trim();

  const mwQuestion = stripped.match(/\bMW:\s*(.+)$/i);

  if (mwQuestion?.[1]?.includes("?")) {
    stripped = mwQuestion[1].trim();
  }

  const extractedQuestions = extractQuestionSentences(stripped);

  if (extractedQuestions) {
    return formatQuestionText(extractedQuestions);
  }

  return formatQuestionText(
    stripped
    .replace(/\bMy Questions\b/gi, "")
    .replace(/\s+/g, " ")
    .trim(),
  );
}

function shouldExtractQuestionLine(line, originType, originFile) {
  if (MY_QUESTIONS_PATTERN.test(line)) {
    return true;
  }

  if (!isMyQuestionsPage(originType, originFile)) {
    return false;
  }

  const cleaned = stripQuestionMarkers(line);

  if (!cleaned || /^\s*-?\s*[A-Z][^?]{0,80}$/.test(cleaned)) {
    return false;
  }

  return isQuestionLike(cleaned);
}

function isMetaQuestion(text) {
  return /^(recommit to|pulling from|how do we add|i am creating a list of|my questions for tomorrow|questions for today)/i.test(
    text,
  );
}

function isQuestionLike(text) {
  if (!text || text.length < 8 || text.length > 700) {
    return false;
  }

  if (text.includes("?")) {
    return true;
  }

  return /^(what|why|how|when|where|who|would|could|should|is|are|do|does|did|can|will|am|i wonder|the question)\b/i.test(
    text,
  );
}

function buildId(originType, originFile, lineIndex) {
  return `${originType}:${originFile}:${lineIndex}`;
}

function buildSignature(question) {
  return [question.originFile, question.text.toLowerCase()].join("|");
}

async function readPreviousDataset() {
  try {
    const content = await fs.readFile(OUTPUT_FILE, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function getMarkdownFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });

  return dirents
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dir, entry.name));
}

async function main() {
  const previousDataset = await readPreviousDataset();
  const previousSignatures = new Set(
    (previousDataset?.questions ?? []).map((question) => buildSignature(question)),
  );
  const allQuestions = [];

  for (const source of SOURCE_DIRECTORIES) {
    const files = await getMarkdownFiles(source.dir);

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");
      const originFile = path.basename(filePath);
      const lines = content.split("\n");

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        if (!shouldExtractQuestionLine(line, source.type, originFile)) {
          continue;
        }

        const text = cleanupQuestionText(line);

        if (!isQuestionLike(text) || isMetaQuestion(text)) {
          continue;
        }

        let sourceLocator = null;

        for (let lookback = index - 1; lookback >= Math.max(0, index - 3); lookback -= 1) {
          sourceLocator = extractSourceLocator(lines[lookback]);

          if (sourceLocator) {
            break;
          }
        }

        allQuestions.push({
          id: buildId(source.type, originFile, index),
          text,
          sourceDisplay: sourceDisplayFor(source.type, originFile),
          sourcePageTitle: decodeFileName(originFile),
          sourceLocator,
          blockId: null,
          tags: collectTags(line),
          originType: source.type,
          originFile,
        });
      }
    }
  }

  const seen = new Set();
  const questions = allQuestions
    .filter((question) => {
      const signature = buildSignature(question);

      if (seen.has(signature)) {
        return false;
      }

      seen.add(signature);
      return true;
    })
    .map((question) => {
      const signature = buildSignature(question);
      return {
        ...question,
        review: {
          isNew: !previousSignatures.has(signature),
          flags: [],
        },
      };
    })
    .sort((left, right) => left.text.localeCompare(right.text));

  const tagSet = new Set();

  for (const question of questions) {
    for (const tag of question.tags) {
      tagSet.add(tag);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceDirectories: SOURCE_DIRECTORIES.map((entry) => entry.dir),
    tags: [...tagSet].sort(),
    stats: {
      totalQuestions: questions.length,
      taggedQuestions: questions.filter((question) => question.tags.length > 0).length,
      newQuestions: questions.filter((question) => question.review.isNew).length,
    },
    questions,
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2) + "\n");

  console.log(
    `Built ${questions.length} questions across ${payload.tags.length} tags into ${OUTPUT_FILE}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
