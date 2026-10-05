// remotion.config.js — how the Remotion command line renders this project.
import { Config } from '@remotion/cli/config';

Config.setEntryPoint('src/index.jsx');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
