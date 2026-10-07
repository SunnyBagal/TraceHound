import { Landing } from "@/components/landing/Landing";

// The landing page. The graph viewer is at /graph (app/graph/page.tsx); old viewer links to "/"
// with ?repo=, ?changes= or ?impact= are sent on there (lib/legacy.ts).
export default function Home() {
  return <Landing />;
}
