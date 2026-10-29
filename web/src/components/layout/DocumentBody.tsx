import { PreviewBanner } from "@/components/layout/PreviewBanner";

/**
 * Locale shell inside root `app/layout.tsx` (html/body live there for 404).
 * Sets `lang` on the document via a tiny boot script when not English.
 */
export function DocumentBody({
  lang,
  previewLabel,
  children,
}: {
  lang: "en" | "uk";
  previewLabel: string;
  children: React.ReactNode;
}) {
  const langBoot =
    lang === "en"
      ? null
      : `(function(){try{document.documentElement.lang=${JSON.stringify(lang)};}catch(e){}})();`;

  return (
    <>
      {langBoot ? (
        <script dangerouslySetInnerHTML={{ __html: langBoot }} />
      ) : null}
      <PreviewBanner label={previewLabel} />
      {children}
    </>
  );
}
