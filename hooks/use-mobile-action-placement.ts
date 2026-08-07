"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export type MobileActionPlacement = "up" | "down";

/**
 * Keep message action menus inside the visual viewport on small screens.
 *
 * Message rows can sit at either edge of the transcript.  A menu that always
 * opens above its trigger is clipped when the row is near the top (and vice
 * versa near the bottom), especially after the mobile browser chrome changes
 * the visual viewport height.  Placement is measured while the native
 * <details> element is open and refreshed on viewport/scroll changes.
 */
export function useMobileActionPlacement(
  detailsRef: RefObject<HTMLDetailsElement | null>,
  open: boolean,
): MobileActionPlacement {
  const [placement, setPlacement] = useState<MobileActionPlacement>("up");

  useLayoutEffect(() => {
    if (!open) return;

    const details = detailsRef.current;
    const summary = details?.querySelector<HTMLElement>("summary");
    const panel = details?.querySelector<HTMLElement>("[data-mobile-action-panel]");
    if (!summary || !panel) return;

    const updatePlacement = () => {
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const safeInset = 8;
      const panelHeight = Math.min(
        panel.scrollHeight || panel.getBoundingClientRect().height,
        Math.max(1, viewportHeight - safeInset * 2),
      );
      const summaryRect = summary.getBoundingClientRect();
      const spaceAbove = Math.max(0, summaryRect.top - safeInset);
      const spaceBelow = Math.max(0, viewportHeight - summaryRect.bottom - safeInset);

      // Prefer the normal upward placement whenever it fits.  If it does not,
      // open downward; when neither side fits, use the side with more room and
      // let the CSS max-height turn the panel into a scrollable menu.
      const next: MobileActionPlacement = spaceAbove >= panelHeight + 4
        ? "up"
        : spaceBelow >= panelHeight + 4 || spaceBelow >= spaceAbove
          ? "down"
          : "up";
      setPlacement((current) => current === next ? current : next);
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updatePlacement);
    viewport?.addEventListener("scroll", updatePlacement);

    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      viewport?.removeEventListener("resize", updatePlacement);
      viewport?.removeEventListener("scroll", updatePlacement);
    };
  }, [detailsRef, open]);

  return placement;
}
