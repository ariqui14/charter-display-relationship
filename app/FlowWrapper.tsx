'use client';

import dynamic from 'next/dynamic';

const FlowCanvas = dynamic(() => import('./FlowCanvas'), {
  ssr: false
});

export default function FlowWrapper() {
  return <FlowCanvas />;
}
