export const SOURCE_DIRECTORIES = {
  journals:
    "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/journals",
  pages:
    "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/pages",
} as const;

export type SourceType = keyof typeof SOURCE_DIRECTORIES;

export function getSourcePath(originType: string, originFile: string) {
  if (originType !== "journals" && originType !== "pages") {
    return null;
  }

  return `${SOURCE_DIRECTORIES[originType]}/${originFile}`;
}
