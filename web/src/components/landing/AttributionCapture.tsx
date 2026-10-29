"use client";

import { useEffect } from "react";
import { captureAttributionFromLocation } from "@/lib/attribution";

/** Persist first-touch UTM/referrer from landing for later consent POST (T-033). */
export function AttributionCapture() {
  useEffect(() => {
    captureAttributionFromLocation();
  }, []);
  return null;
}
