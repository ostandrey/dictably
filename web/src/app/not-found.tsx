import Link from "next/link";
import { IllNotFound } from "@/components/illustrations";

/**
 * Static 404.html — EN + UK markup always present; locale from html[data-nf-lang]
 * set by the boot script in root layout <head> (before paint). CSS shows one language.
 */
export default function NotFound() {
  return (
    <main className="not-found" data-not-found>
      <div className="dy-empty dy-empty--rich">
        <div className="dy-empty__ill" aria-hidden>
          <IllNotFound />
        </div>

        <div className="not-found__copy not-found__copy--en" lang="en" data-nf-locale="en">
          <h1 className="dy-empty__title" data-nf="title">
            Page not found
          </h1>
          <p className="dy-empty__body" data-nf="body">
            That link does not match any page in Dictably.
          </p>
          <div className="dy-empty__action not-found__actions">
            <Link href="/" className="btn-primary" data-nf="home">
              Home
            </Link>
            <Link href="/app/" className="btn-secondary" data-nf="app">
              My recordings
            </Link>
          </div>
        </div>

        <div className="not-found__copy not-found__copy--uk" lang="uk" data-nf-locale="uk">
          <h1 className="dy-empty__title" data-nf="title">
            Сторінку не знайдено
          </h1>
          <p className="dy-empty__body" data-nf="body">
            Це посилання не веде на жодну сторінку Dictably.
          </p>
          <div className="dy-empty__action not-found__actions">
            <Link href="/uk/" className="btn-primary" data-nf="home">
              На головну
            </Link>
            <Link href="/uk/app/" className="btn-secondary" data-nf="app">
              Мої записи
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
