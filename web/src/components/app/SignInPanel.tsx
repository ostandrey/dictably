"use client";

import {
  RecordingsPanel,
  type RecordingsCopy,
} from "@/components/app/RecordingsPanel";
import { useAuth } from "@/components/app/AuthProvider";

type Props = {
  recordingBaseHref: string;
  recordings: RecordingsCopy;
  deletedToast: string;
};

/**
 * Authenticated home only. Anonymous users see SignInScreen via RequireAuth
 * in AppChrome (T-037) — never render app chrome content here while signed out.
 */
export function SignInPanel({
  recordingBaseHref,
  recordings,
  deletedToast,
}: Props) {
  const { status, user } = useAuth();

  if (status === "loading" || !user) {
    return null;
  }

  return (
    <div className="sign-in sign-in--home" data-auth="home">
      <RecordingsPanel
        copy={recordings}
        recordingBaseHref={recordingBaseHref}
        deletedToast={deletedToast}
      />
    </div>
  );
}
