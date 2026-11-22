import { Composition } from "remotion";
import { Race } from "./Race";
import { DURATION, FPS } from "./timing";

export const Root = () => (
  <Composition id="Race" component={Race} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
);
