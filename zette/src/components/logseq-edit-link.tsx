"use client";

import type { MouseEvent, ReactNode } from "react";

type LogseqEditLinkProps = {
  blockUrl: string | null;
  pageUrl: string;
  copyText?: string | null;
  className?: string;
  children: ReactNode;
};

function isMobileLogseqTarget() {
  if (typeof navigator === "undefined") {
    return true;
  }

  const userAgent = navigator.userAgent;
  const isTouchMac =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isTouchMac;
}

async function copyForPageFallback(copyText?: string | null) {
  const text = copyText?.trim();

  if (!text || typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard access is best-effort; opening the page is the important action.
  }
}

export function LogseqEditLink({
  blockUrl,
  pageUrl,
  copyText,
  className,
  children,
}: LogseqEditLinkProps) {
  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    const usePageFallback = !blockUrl || isMobileLogseqTarget();
    const targetUrl = usePageFallback ? pageUrl : blockUrl;

    if (usePageFallback) {
      await copyForPageFallback(copyText);
    }

    window.location.href = targetUrl;
  };

  return (
    <a
      className={className}
      data-logseq-block-url={blockUrl ?? undefined}
      href={pageUrl}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
