"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Viewer } from "@/components/Viewer";
import { changesParam } from "@/lib/changes";
import { impactParam } from "@/lib/impact";
import { loadChanges, loadImpact, loadRepo, type Loaded } from "@/lib/load";

type State = { status: "loading" } | { status: "error"; message: string } | ({ status: "ready" } & Loaded);

export default function Page() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    // ?changes= wins over ?impact=, which wins over ?repo= (or the manifest's defaultRepo)
    const search = window.location.search;
    const changes = changesParam(search);
    const impact = impactParam(search);
    (changes ? loadChanges(changes) : impact ? loadImpact(impact) : loadRepo(search))
      .then((loaded) => setState({ status: "ready", ...loaded }))
      .catch((error: Error) => setState({ status: "error", message: error.message }));
  }, []);

  if (state.status === "ready") return <Viewer {...state} />;
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
