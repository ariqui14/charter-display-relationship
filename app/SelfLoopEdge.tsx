import { BaseEdge, EdgeProps, getBezierPath } from 'reactflow';

export default function SelfLoopEdge({
  id,
  sourceX,
  sourceY,
  style,
  markerEnd
}: EdgeProps) {

  const loopSize = 120;

  const path = `
    M ${sourceX} ${sourceY}
    C ${sourceX - loopSize} ${sourceY - loopSize},
      ${sourceX + loopSize} ${sourceY - loopSize},
      ${sourceX} ${sourceY}
  `;

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{...style}}
      markerEnd={markerEnd}
    />
  );
}
