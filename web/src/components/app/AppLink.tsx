"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";

type Props = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  children: ReactNode;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Client Link with optional View Transition (160–200 ms) when supported. */
export function AppLink({ href, onClick, children, ...rest }: Props) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    const url = typeof href === "string" ? href : String(href);
    if (url.startsWith("http") || url.startsWith("mailto:")) return;
    e.preventDefault();

    const go = () => {
      startTransition(() => {
        router.push(url);
      });
    };

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };
    if (doc.startViewTransition && !prefersReducedMotion()) {
      doc.startViewTransition(go);
    } else {
      go();
    }
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
