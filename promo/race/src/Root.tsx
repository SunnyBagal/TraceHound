import { Composition } from "remotion";
import { Chart } from "./Chart";
import { DURATION, FPS } from "./timing";

export const Root = () => (
  <Composition id="Chart" component={Chart} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
);
