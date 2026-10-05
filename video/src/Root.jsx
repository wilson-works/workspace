// Root.jsx — one composition per video, 30 fps, sized and timed from its caption script.

import React from 'react';
import { Composition } from 'remotion';
import { FPS } from './brand';
import { Video, durationOf } from './Video';
import { VIDEOS } from './scripts';

export const Root = () => (
  <>
    {VIDEOS.map((script) => (
      <Composition
        key={script.id}
        id={script.id}
        component={Video}
        durationInFrames={durationOf(script)}
        fps={FPS}
        width={script.width}
        height={script.height}
        defaultProps={{ script }}
      />
    ))}
  </>
);
