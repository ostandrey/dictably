import Link from "next/link";
import { IllNotFound } from "@/components/illustrations";

/** Static-export 404.html — styled via root layout (fonts + globals). */
export default function NotFound() {
  return (
    <main className="not-found" data-not-found>
      <div className="dy-empty dy-empty--rich">
        <div className="dy-empty__ill" aria-hidden>
          <IllNotFound />
        </div>
        <h1 className="dy-empty__title">Page not found</h1>
        <p className="dy-empty__body">
          That link does not match any page in Dictably.
        </p>
        <div className="dy-empty__action not-found__actions">
          <Link href="/" className="btn-primary" lang="en">
            Home
          </Link>
          <Link href="/uk/" className="btn-secondary" lang="uk">
            На головну
          </Link>
          <Link href="/app/" className="btn-secondary">
            My recordings
          </Link>
        </div>
      </div>
    </main>
  );
}
