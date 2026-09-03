export type SearchResultClickEvent = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  currentTarget: {
    target?: string | null;
    getAttribute: (name: string) => string | null;
  };
  preventDefault: () => void;
};

export function buildPieceHref(
  pieceId: string,
  selectedTags: string[],
  piecePath: string,
): string {
  const params = new URLSearchParams();

  if (selectedTags.length > 0) {
    params.set("tags", selectedTags.join(","));
  }

  params.set("p", pieceId);

  return `${piecePath}?${params.toString()}`;
}

export function buildTagsHref(selectedTags: string[], tag: string | null): string {
  if (!tag) {
    return "/";
  }

  const nextTags = selectedTags.includes(tag)
    ? selectedTags.filter((value) => value !== tag)
    : [...selectedTags, tag];

  if (nextTags.length === 0) {
    return "/";
  }

  return `/?tags=${encodeURIComponent(nextTags.join(","))}`;
}

export function shouldHandleSearchResultNavigation(
  event: SearchResultClickEvent,
): boolean {
  const target =
    event.currentTarget.target || event.currentTarget.getAttribute("target");

  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    (!target || target === "_self")
  );
}

export function navigateSearchResultClick(
  event: SearchResultClickEvent,
  href: string,
  navigate: (href: string) => void,
  onSelectPiece?: () => void,
): boolean {
  if (!shouldHandleSearchResultNavigation(event)) {
    return false;
  }

  event.preventDefault();
  navigate(href);
  onSelectPiece?.();

  return true;
}
