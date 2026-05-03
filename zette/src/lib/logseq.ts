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

export function getLogseqUrl(originType: string, originFile: string) {
  const graph = encodeURIComponent(getGraphName());
  const page = encodeURIComponent(getLogseqPageName(originType, originFile));

  return `logseq://graph/${graph}?page=${page}`;
}
