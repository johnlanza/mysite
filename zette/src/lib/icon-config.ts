export const ZETTE_ICON_VERSION = "porcelain-cameo-20260903";
export const ZETTE_ICON_THEME_COLOR = "#4a1f4e";
export const ZETTE_ICON_BACKGROUND_COLOR = "#4a1f4e";

export function withIconVersion(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${ZETTE_ICON_VERSION}`;
}
