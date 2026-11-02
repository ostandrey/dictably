"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/** Sticky strip when the browser is offline (T-040). */
export function OfflineBanner() {
  const t = useTranslations("app");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const apply = () => setOffline(!navigator.onLine);
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="dy-offline" data-offline="banner" role="status">
      {t("offlineBanner")}
    </div>
  );
}
