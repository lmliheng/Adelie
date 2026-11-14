import { Config } from "@remotion/cli/config";

// A machine without a GPU renders through SwiftShader's software GL; the same flag
// keeps a GPU box on the fast path but never changes what the frames look like.
Config.setChromiumOpenGlRenderer("swangle");

// Use the browser that is installed instead of downloading Remotion's own headless
// shell: this repo is rendered on a server whose package manager already has Chromium.
Config.setBrowserExecutable(
  process.env.REMOTION_BROWSER ?? "/usr/bin/chromium",
);

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
