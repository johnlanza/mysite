export const SOURCE_DIRECTORIES = {
  journals:
    "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/journals",
  pages:
    "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/pages",
} as const;

export type SourceType = keyof typeof SOURCE_DIRECTORIES;

function isSafeSourceFileName(originFile: string) {
  return (
    originFile.endsWith(".md") &&
    !originFile.includes("/") &&
    !originFile.includes("\\") &&
    !originFile.includes("\0")
  );
}

export function getSourcePath(originType: string, originFile: string) {
  if (originType !== "journals" && originType !== "pages") {
    return null;
  }

  if (!isSafeSourceFileName(originFile)) {
    return null;
  }

  return `${SOURCE_DIRECTORIES[originType]}/${originFile}`;
}
