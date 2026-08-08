const DEFAULT_GRAPH_NAME = "Documents";

function getGraphName() {
  return (
    process.env.NEXT_PUBLIC_LOGSEQ_GRAPH_NAME?.trim() || DEFAULT_GRAPH_NAME
  );
}

export function getLogseqPageName(originType: string, originFile: string) {
  const pageName = decodeURIComponent(originFile.replace(/\.md$/i, ""));

  if (originType === "journals") {
    return pageName;
  }

  return pageName;
}

export function getLogseqPageUrl(originType: string, originFile: string) {
  const graph = encodeURIComponent(getGraphName());
  const page = encodeURIComponent(getLogseqPageName(originType, originFile));

  return `logseq://graph/${graph}?page=${page}`;
}

export function getLogseqBlockUrl(blockId: string) {
  const graph = encodeURIComponent(getGraphName());

  return `logseq://graph/${graph}?block-id=${encodeURIComponent(blockId.trim())}`;
}

export function getLogseqUrl(
  originType: string,
  originFile: string,
  blockId?: string | null,
) {
  if (blockId?.trim()) {
    return getLogseqBlockUrl(blockId);
  }

  return getLogseqPageUrl(originType, originFile);
}
