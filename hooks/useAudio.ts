"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export function useAudio() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("pi-sound-enabled");
    return stored === null ? true : stored === "true";
  });

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("pi-sound-enabled", String(next));
      return next;
    });
  }, []);

  // One shared AudioContext, unlocked on the first user gesture. A context
  // created outside a gesture starts "suspended" and schedules oscillators
  // into silence — which is exactly when the done-chime fires (agent_end
  // arrives via SSE, no gesture in the call stack).
  const ctxRef = useRef<AudioContext | null>(null);
  const getCtx = useCallback((): AudioContext | null => {
    try {
      ctxRef.current ??= new AudioContext();
      return ctxRef.current;
    } catch {
      return null; // AudioContext unavailable
    }
  }, []);

  useEffect(() => {
    const unlock = () => {
      const ctx = getCtx();
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [getCtx]);

  const playDone = useCallback(() => {
    if (!enabledRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const schedule = () => {
      try {
        const now = ctx.currentTime;
        const freqs = [523.25, 659.25];
        freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = freq;
          const t = now + i * 0.18;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          osc.start(t);
          osc.stop(t + 0.45);
        });
      } catch {
        // scheduling failed — skip this chime
      }
    };
    if (ctx.state === "suspended") {
      // Resume works once the user has interacted at least once this page.
      void ctx.resume().then(schedule).catch(() => {});
    } else {
      schedule();
    }
  }, [getCtx]);

  return { soundEnabled: enabled, onSoundToggle: toggle, playDoneSound: playDone, soundEnabledRef: enabledRef };
}