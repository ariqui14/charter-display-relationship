import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

export async function getLayoutedElements(nodes: any[], edges: any[]) {
  if (!nodes.length) return { nodes, edges };

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100'
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: 180,
      height: 60
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target]
    }))
  };

  const layout = await elk.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const elkNode = layout.children?.find((n) => n.id === node.id);

    return {
      ...node,
      position: {
        x: elkNode?.x || 0,
        y: elkNode?.y || 0
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}
