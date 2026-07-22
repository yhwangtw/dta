"use client";

import type { ExtensionUIState } from "@/hooks/use-extension-ui";
import type { WebExtensionUIResponse, WebExtensionUIWidgetPlacement } from "@/lib/web-extension-ui-types";
import { UserQuestionCard } from "./UserQuestionCard";
import styles from "./ExtensionUIPanel.module.css";

interface Props {
  state: ExtensionUIState;
  onRespond: (response: WebExtensionUIResponse) => Promise<void>;
  wide?: boolean;
}

export function ExtensionUIPanel({ state, onRespond, wide = false }: Props) {
  const dialog = state.dialogs[0];
  const hasAboveWidgets = Object.values(state.widgets).some((widget) => widget.placement === "aboveEditor");
  const hasStatuses = Object.keys(state.statuses).length > 0;
  if (!dialog && !hasAboveWidgets && !hasStatuses) return null;

  return (
    <div className={styles.outer} data-testid="extension-question">
      <div className={`${styles.inner} ${wide ? styles.innerWide : ""}`}>
        <ExtensionWidgets state={state} placement="aboveEditor" bare />
        {hasStatuses && (
          <div className={styles.statusRow} role="status">
            {Object.entries(state.statuses).map(([key, text]) => (
              <span key={key} className={styles.statusChip}>
                <span className={styles.statusDot} aria-hidden />
                <span className={styles.statusKey}>{key}</span>
                <span>{text}</span>
              </span>
            ))}
          </div>
        )}
        {dialog && <UserQuestionCard request={dialog} pendingCount={state.dialogs.length} onRespond={onRespond} />}
      </div>
    </div>
  );
}

export function ExtensionWidgets({ state, placement, wide = false, bare = false }: {
  state: ExtensionUIState;
  placement: WebExtensionUIWidgetPlacement;
  wide?: boolean;
  bare?: boolean;
}) {
  const widgets = Object.entries(state.widgets).filter(([, widget]) => widget.placement === placement);
  if (widgets.length === 0) return null;
  const content = (
    <div className={styles.widgets}>
      {widgets.map(([key, widget]) => (
        <section key={key} className={styles.widget} aria-label={key}>
          <span className={styles.widgetKey}>{key}</span>
          <span className={styles.widgetText}>{widget.lines.join("\n")}</span>
        </section>
      ))}
    </div>
  );
  if (bare) return content;
  return (
    <div className={styles.outer}>
      <div className={`${styles.inner} ${wide ? styles.innerWide : ""}`}>{content}</div>
    </div>
  );
}
