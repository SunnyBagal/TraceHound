"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Viewer } from "@/components/Viewer";
import { loadLatestSnapshot } from "@/lib/load";
import type { Snapshot } from "@/lib/types";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; snapshot: Snapshot };

export default function Page() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    loadLatestSnapshot()
      .then(({ snapshot }) => setState({ status: "ready", snapshot }))
      .catch((error: Error) => setState({ status: "error", message: error.message }));
  }, []);

  if (state.status === "ready") return <Viewer snapshot={state.snapshot} />;
  return (
    <div className="grid h-dvh place-items-center px-6 text-center">
      <div>
        <Logo className="mx-auto size-10" />
        {state.status === "loading" ? (
          <p className="mt-3 text-sm text-muted">Loading snapshot…</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-text">Couldn&apos;t load a snapshot</p>
            <p className="mt-1 font-mono text-xs text-faint">{state.message}</p>
          </>
        )}
      </div>
    </div>
  );
}
