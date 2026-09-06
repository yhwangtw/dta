"use client";

import styles from "./PiAgentTitle.module.css";
import { useI18n } from "@/lib/i18n";

/** DTA compact wordmark. Pi remains the runtime, not the product identity. */
export function PiAgentTitle() {
  const { t } = useI18n();
  return (
    <span className={styles.lockup} title={t("dta.brand.fullName")}>
      <span className={styles.textCol}>
        <span className={styles.name}>DTA</span>
        <span className={styles.tagline}>{t("dta.brand.platform")}</span>
      </span>
    </span>
  );
}
