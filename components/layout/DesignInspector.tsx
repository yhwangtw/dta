"use client";

import { useEffect, useState } from "react";
import { formatDesignContext, type DesignSnapshot } from "@/lib/design-context";
import s from "./DesignInspector.module.css";

interface Props {
  active: boolean;
  onClose: () => void;
  onCapture: (context: string) => void;
}

const STYLE_PROPERTIES = [
  "display", "position", "width", "height", "padding", "margin", "gap",
  "font-family", "font-size", "font-weight", "line-height", "color",
  "background-color", "border", "border-radius", "box-shadow",
  "grid-template-columns", "flex-direction", "align-items", "justify-content",
];

function cssPath(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 5) {
    const tag = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) { parts.unshift(tag); break; }
    const sameTag = [...parent.children].filter((child) => child.tagName === current!.tagName);
    const index = sameTag.indexOf(current) + 1;
    parts.unshift(`${tag}${sameTag.length > 1 ? `:nth-of-type(${index})` : ""}`);
    current = parent;
  }
  return parts.join(" > ");
}

function snapshotOf(element: HTMLElement): DesignSnapshot {
  const computed = getComputedStyle(element);
  const styles = Object.fromEntries(STYLE_PROPERTIES.map((property) => [property, computed.getPropertyValue(property)]));
  const bounds = element.getBoundingClientRect();
  return {
    selector: cssPath(element),
    tagName: element.tagName,
    text: (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 240),
    html: element.outerHTML.slice(0, 4_000),
    rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    styles,
  };
}

export function DesignInspector({ active, onClose, onCapture }: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DesignSnapshot["rect"] | null>(null);

  useEffect(() => {
    if (!active) {
      setTarget(null);
      setRect(null);
      return;
    }

    const updateTarget = (element: HTMLElement | null) => {
      if (!element || element === document.body || element === document.documentElement) {
        setTarget(null);
        setRect(null);
        return;
      }
      setTarget(element);
      const bounds = element.getBoundingClientRect();
      setRect({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    };

    const onPointerMove = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!(element instanceof HTMLElement) || element.closest("[data-design-inspector]")) return;
      updateTarget(element);
    };
    const onClick = (event: MouseEvent) => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || element.closest("[data-design-inspector]")) return;
      event.preventDefault();
      event.stopPropagation();
      onCapture(formatDesignContext(snapshotOf(element)));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.body.dataset.designMode = "1";
    return () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      delete document.body.dataset.designMode;
    };
  }, [active, onCapture, onClose]);

  if (!active) return null;

  return (
    <div className={s.root} data-design-inspector aria-live="polite">
      {rect && <div className={s.highlight} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />}
      <div className={s.toolbar}>
        <span className={s.dot} aria-hidden="true" />
        <strong>Design mode</strong>
        <span className={s.hint}>{target ? "Click to capture" : "Move over an element"}</span>
        <button type="button" onClick={onClose} aria-label="Close design mode">Esc</button>
      </div>
      {target && rect && (
        <div className={s.label} style={{ left: Math.max(8, rect.x), top: Math.max(8, rect.y - 28) }}>
          {target.tagName.toLowerCase()} · {Math.round(rect.width)}×{Math.round(rect.height)}
        </div>
      )}
    </div>
  );
}
