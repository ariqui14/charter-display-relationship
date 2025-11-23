 
"use client";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import {ReactFlowProvider} from "reactflow"

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ReactFlowProvider> 
        <ConvexProvider client={convex}> 
        {children}
        </ConvexProvider>
        </ReactFlowProvider>
      </body>
    </html>
  );
}

export async function getLayoutedElements(nodes: any[], edges: any[]) {
  if (typeof window === 'undefined') return { nodes, edges };

  const dagre = await import('@dagrejs/dagre');
  const d = dagre.default as any;

  const graph = new d.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));

  graph.setGraph({
    rankdir: 'LR', // HORIZONTAL LAYOUT
    nodesep: 80,
    ranksep: 100
  });

  const nodeWidth = 180;
  const nodeHeight = 60;

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  d.layout(graph);

  nodes.forEach((node) => {
    const { x, y } = graph.node(node.id);
    node.position = {
      x: x - nodeWidth / 2,
      y: y - nodeHeight / 2
    };
  });

  return { nodes, edges };
}
