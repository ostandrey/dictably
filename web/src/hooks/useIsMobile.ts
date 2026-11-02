"use client";

import { useEffect, useState } from "react";

/** App phone breakpoint: ≤767 mobile, ≥768 desktop (T-041 B6 / iPad mini). */
export const APP_MOBILE_MAX_PX = 767;

/** True when viewport is ≤767px (sheets / mobile layouts). */
export function useIsMobile(breakpoint = APP_MOBILE_MAX_PX): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);

  return mobile;
}
