# Third-party notices

## Lucide icons

- **License:** MIT
- **Source:** [lucide.dev](https://lucide.dev) / [github.com/lucide-icons/lucide](https://github.com/lucide-icons/lucide)
- **Use:** Inline SVG icons on the landing “Why” section (`web/src/components/landing/WhyIcons.tsx`): circle-check, list lines, globe, lock — 18×18, stroke 1.6.

## python-docx

- **License:** MIT
- **Source:** [python-docx](https://github.com/python-openxml/python-docx)
- **Use:** Server-side DOCX export for minutes and transcripts (T-017).

## WeasyPrint

- **License:** BSD-3-Clause
- **Source:** [WeasyPrint](https://github.com/Kozea/WeasyPrint)
- **Use:** HTML→PDF renderer for minutes export (T-017). System libraries (Pango/Cairo) required; installed in `backend/Dockerfile`.

## Onest font

- **License:** SIL Open Font License 1.1 (see `backend/src/dictably/assets/fonts/OFL-Onest.txt`)
- **Source:** [Onest](https://github.com/google/fonts/tree/main/ofl/onest)
- **Use:** Primary typeface embedded in exported PDFs; preferred face name in DOCX (Calibri as local fallback) (T-017).

## DejaVu Fonts

- **License:** Bitstream Vera Fonts Copyright + Public Domain changes (see `backend/src/dictably/assets/fonts/LICENSE-DejaVu.txt`)
- **Source:** [dejavu-fonts](https://dejavu-fonts.github.io/)
- **Use:** Glyph fallback in PDF when a character is missing from Onest (T-017).
