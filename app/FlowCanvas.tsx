'use client';

import React, { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import SelfLoopEdge from "./SelfLoopEdge";
import { Id } from "../convex/_generated/dataModel";
import type { Doc } from "../convex/_generated/dataModel";
import type { TeamNode } from "./components/types/TeamNode";
import type { Deliverable } from "./components/types/Deliverable";
import { useTeams } from "./components/hooks/useTeams";
import { useSaves } from "./components/hooks/useSaves";

import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  Edge,
  MarkerType
} from "reactflow";

import "reactflow/dist/style.css";
import '@xyflow/react/dist/style.css';

// Animations
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.5 } }
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

// Status colors
function getStatusStyles(status?: string) {
  switch (status) {
    case "complete":
      return { background: "#16a34a", color: "#ffffff" };
    case "in-progress":
      return { background: "#facc15", color: "#000000" };
    case "not-started":
    default:
      return { background: "#64748b", color: "#ffffff" };
  }
}

export default function FlowCanvas() {

  const { teams, updateDeliverables, updatePosition } = useTeams();
  const { previousSaves, saveRelationships, loadRelationships } = useSaves();

  const [nodes, setNodes] = useState<TeamNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Doc<"teams">| null>(null);

  const [editMode, setEditMode] = useState(false);
  const [editedDeliverables, setEditedDeliverables] = useState<Deliverable[]>([]);

  // -------------------------
  // Centralized Radial Layout
  // -------------------------
  const applyRadialLayout = useCallback((centerNodeId: string) => {
    setNodes((nds) => {
      const centerNode = nds.find((n) => n.id === centerNodeId);
      if (!centerNode) return nds;

      const connectedEdges = edges.filter(
        (e) => e.source === centerNodeId || e.target === centerNodeId
      );

      const connectedNodeIds = new Set<string>();
      connectedEdges.forEach((e) => {
        connectedNodeIds.add(e.source);
        connectedNodeIds.add(e.target);
      });

      const radius = 450;
      let angle = 0;
      const step = (2 * Math.PI) / (connectedNodeIds.size || 1);

      return nds.map((node) => {
        if (
          !connectedNodeIds.has(node.id) ||
          node.id === centerNodeId ||
          node.data?.label === "NEXT PHASE"
        ) {
          return node;
        }

        angle += step;

        return {
          ...node,
          position: {
            x: centerNode.position.x + Math.cos(angle) * radius,
            y: centerNode.position.y + Math.sin(angle) * radius
          }
        };
      });
    });
  }, [edges]);

  // -------------------------
  // Node Click Handler
  // -------------------------
  const onNodeClick = useCallback((_: React.MouseEvent, node: TeamNode) => {
    setSelectedNodeId(node.id);
    setSidebarOpen(true);

    // trigger radial layout here
    applyRadialLayout(node.id);
  }, [applyRadialLayout]);

  // -------------------------
  // Build Nodes and Edges from DB
  // -------------------------
  useEffect(() => {
    if (!teams) return;

    const mappedNodes: TeamNode[] = teams.map((t) => {
      const isNextPhase = t.team === "NEXT PHASE";
      const isTesting = (t.team || "").toString().toUpperCase() === "TESTING";

      return {
        id: t._id,
        position: { x: t.position_x ?? 0, y: t.position_y ?? 0 },
        data: { label: t.team, deliverables: t.deliverables as Deliverable[] },
        draggable: !isNextPhase && !isTesting,
        type: "default",
        style: isNextPhase || isTesting ? {
          border: "3px solid #3b82f6",
          borderRadius: 12,
          padding: 12,
          width: 360,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 36,
          background: "#e0f2fe",
        } : undefined
      };
    });

    // Special node positioning
    const others = mappedNodes.filter(n =>
      !["NEXT PHASE", "TESTING"].includes((n.data.label || "").toUpperCase())
    );

    if (others.length) {
      const xs = others.map(n => n.position.x);
      const ys = others.map(n => n.position.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const centerX = Math.round((minX + maxX) / 2);
      const centerY = Math.round((minY + maxY) / 2);

      const updated = mappedNodes.map((n) => {
        const label = (n.data.label || "").toUpperCase();

        if (label === "NEXT PHASE") {
          return { ...n, position: { x: centerX, y: maxY + 220 } };
        }

        if (label === "TESTING") {
          return { ...n, position: { x: centerX, y: centerY }, draggable: false };
        }

        return n;
      });

      mappedNodes.length = 0;
      updated.forEach(n => mappedNodes.push(n));
    }

    // Build edges
    const edgeMap = new Map<string, Edge>();

    teams.forEach((team) => {
      team.deliverables?.forEach((_d) => {
        const d = _d as Deliverable;
        if (!d.deliver_to) return;

        const sourceId = team._id;
        const targetTeam = teams.find((tt) => tt.team === d.deliver_to);
        if (!targetTeam) return;

        const targetId = targetTeam._id;
        const edgeId = `${sourceId}->${targetId}`;

        if (!edgeMap.has(edgeId)) {
          const status = d.status;

          edgeMap.set(edgeId, {
            id: edgeId,
            source: sourceId,
            target: targetId,
            type: sourceId === targetId ? "self" : "smoothstep",
            animated: status === "in-progress",
            style: {
              stroke: getStatusStyles(status).background,
              strokeWidth: 3
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: getStatusStyles(status).background
            },
            data: { status, text: d.text }
          });
        }
      });
    });

    setNodes(mappedNodes);
    setEdges(Array.from(edgeMap.values()));

  }, [teams]);

  const edgeTypes = { self: SelfLoopEdge };

  function isEdgeConnected(edge: Edge, nodeId: string | null) {
    if (!nodeId) return false;
    return edge.source === nodeId || edge.target === nodeId;
  }

  function getTeamName(id: string | undefined | null) {
    if (!id) return "";
    return teams?.find((t) => t._id === id)?.team ?? id;
  }

  // -------------------------
  // Only Edge Styling Effect  (NO RADIAL LAYOUT HERE ANYMORE)
  // -------------------------
  useEffect(() => {
  if (!selectedNodeId) return;

  setEdges((prevEdges) => {
    let changed = false;

    const updated = prevEdges.map((edge) => {
      const isConnected = isEdgeConnected(edge, selectedNodeId);
      const statusColor = getStatusStyles(edge.data?.status).background;
      const isInProgress = edge.data?.status === "in-progress";

      const newEdge = {
        ...edge,
        animated: isInProgress || isConnected,
        style: {
          stroke: statusColor,
          strokeWidth: isConnected ? 8 : 3,
          opacity: isConnected ? 1 : 0.7
        },
        label: isConnected
          ? `${getTeamName(edge.source)} → ${getTeamName(edge.target)}`
          : undefined
      };

      // detect if anything changed
      if (
        newEdge.animated !== edge.animated ||
        newEdge.style?.strokeWidth !== edge.style?.strokeWidth ||
        newEdge.style?.opacity !== edge.style?.opacity ||
        newEdge.label !== edge.label
      ) {
        changed = true;
      }

      return newEdge;
    });

    // Prevent infinite rerender — only return updated edges when changes occurred
    return changed ? updated : prevEdges;
  });

  setSelectedTeam(teams?.find((t) => t._id === selectedNodeId) ?? null);

}, [selectedNodeId, teams]);


  // Sidebar deliverable sync
  useEffect(() => {
    if (selectedTeam) {
      setEditedDeliverables(
        (selectedTeam.deliverables || []).map((d) => ({
          ...d,
          status: d.status as Deliverable["status"]
        }))
      );
      setEditMode(false);
    }
  }, [selectedTeam]);

  function getDeliverableLabel(edge: Edge) {
    if (!teams || !selectedNodeId) return null;

    const team = teams.find((t) => t._id === selectedNodeId);
    if (!team) return null;

    const targetTeamName = teams.find((t) => t._id === edge.target)?.team;

    const deliverable = team.deliverables?.find(
      (d: any) =>
        d.deliver_to === edge.target || d.deliver_to === targetTeamName
    );

    return deliverable?.text || `TEAM EXPECTING DELIVERABLE`;
  }

  // -------------------------
  // Node drag handlers
  // -------------------------
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((ns) => applyNodeChanges(changes as any, ns)),
    []
  );

  const onNodeDragStop = useCallback(
    (_: any, node: TeamNode) => {
      const nextPhase = nodes.find((n) => n.data?.label === "NEXT PHASE");
      let clampedY = node.position.y;
      const minY = nextPhase ? nextPhase.position.y - 150 : -Infinity;

      if (clampedY >= minY) clampedY = minY;

      const newPos = { x: node.position.x, y: clampedY };

      setNodes((ns) =>
        ns.map((n) =>
          n.id === node.id ? { ...n, position: newPos } : n
        )
      );

      updatePosition({
        id: node.id as Id<"teams">,
        x: newPos.x,
        y: newPos.y,
      });

      setIsDragging(false);
    },
    [nodes, updatePosition]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((es) => applyEdgeChanges(changes as any, es)),
    []
  );

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((es) => addEdge(params, es)),
    []
  );

  const onNodeDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  // -------------------------
  // UI Rendering
  // -------------------------
  return (
    <div className="flex h-screen w-screen bg-zinc-100 dark:bg-black overflow-hidden">

      {/* Left Sidebar Toggle Area */}
      <div
        className="absolute top-0 left-0 h-full z-50 group"
        style={{ width: sidebarOpen ? "0px" : "20vw" }}
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`absolute top-80 z-50 px-3 py-2 rounded bg-zinc-800 text-white hover:bg-zinc-700 transition-all duration-300
          ${sidebarOpen ? "opacity-100 left-96" : "opacity-0 group-hover:opacity-100"}`}
          style={{ left: sidebarOpen ? "285px" : "0px" }}
        >
          {sidebarOpen ? "← Hide Panel" : "Show Panel →"}
        </button>
      </div>

      {/* Line Key */}
      <div className="absolute top-4 right-4 z-60">
        <div className="bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 p-3 rounded-lg shadow-lg max-w-sm">
          <h3 className="text-sm font-semibold mb-2">Line Key</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center space-x-3">
              <div style={{ width: 90, height: 0, borderBottom: '4px solid #64748b' }} />
              <div>Not started relationship</div>
            </div>
            <div className="flex items-center space-x-3">
              <div style={{ width: 90, height: 0, borderBottom: '4px dashed #facc15' }} />
              <div>In progress relationship</div>
            </div>
            <div className="flex items-center space-x-3">
              <div style={{ width: 90, height: 0, borderBottom: '4px solid #16a34a' }} />
              <div>Complete relationship</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          sidebarOpen ? "w-96 pr-6" : "w-0"
        }`}
      >
        <aside className="w-72 min-w-[250px] h-full bg-white dark:bg-zinc-900 shadow-lg border-r border-zinc-300 dark:border-zinc-700 p-6 overflow-y-auto">
          <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">

            {/* Logo */}
            <motion.div variants={item} className="bg-gray-800 p-3 inline-block rounded">
              <Image
                className="dark:invert"
                src="/charter_logo.svg"
                alt="Charter Space logo"
                width={120}
                height={40}
              />
            </motion.div>

            <motion.div variants={item} className="space-y-2">
              
              {!selectedTeam && (
                <>
                  <h2 className="font-semibold text-lg">Teams</h2>
                  {teams?.map(({ team }) => (
                    <div key={team} className="text-zinc-600">{team}</div>
                  ))}
                </>
              )}

              {selectedTeam && (
                <>
                  <h2 className="font-bold text-xl">{selectedTeam.team}</h2>

                  <div className="space-y-3">
                    {editedDeliverables.map((d, index) => (
                      <div key={index} className="p-3 rounded bg-zinc-100 dark:bg-zinc-800 space-y-2">

                        {/* TEXT */}
                        {editMode ? (
                          <input
                            className="w-full p-2 rounded text-sm bg-white"
                            value={d.text}
                            onChange={(e) => {
                              const updated = [...editedDeliverables];
                              updated[index].text = e.target.value;
                              setEditedDeliverables(updated);
                            }}
                          />
                        ) : (
                          <p className="text-sm font-semibold">{d.text}</p>
                        )}

                        {/* DELIVER TO */}
                        {editMode ? (
                          <select
                            className="w-full p-2 rounded text-sm"
                            value={d.deliver_to}
                            onChange={(e) => {
                              const updated = [...editedDeliverables];
                              updated[index].deliver_to = e.target.value;
                              setEditedDeliverables(updated);
                            }}
                          >
                            {teams?.map(({ team }) => (
                              <option key={team} value={team}>
                                {team}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-zinc-500">
                            Deliver to: {d.deliver_to}
                          </p>
                        )}

                        {/* STATUS */}
                        {editMode ? (
                          <select
                            className="w-full p-2 rounded text-sm"
                            value={d.status}
                            onChange={(e) => {
                              const updated = [...editedDeliverables];
                              updated[index].status = e.target.value as Deliverable["status"];
                              setEditedDeliverables(updated);
                            }}
                          >
                            <option value="complete">complete</option>
                            <option value="in-progress">in-progress</option>
                            <option value="not-started">not-started</option>
                          </select>
                        ) : (
                          <span
                            style={{
                              background: getStatusStyles(d.status).background,
                              color: getStatusStyles(d.status).color,
                              padding: "4px 8px",
                              borderRadius: 8,
                              fontWeight: 700,
                              display: "inline-block",
                              textTransform: "capitalize"
                            }}
                          >
                            {d.status}
                          </span>
                        )}

                      </div>
                    ))}
                  </div>

                  <button
                    onClick={async () => {
                      if (editMode) {
                        await updateDeliverables({
                          team: selectedTeam.team,
                          deliverables: editedDeliverables
                        });
                      }
                      setEditMode(!editMode);
                    }}
                    className="mt-4 w-full py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {editMode ? "Confirm Relationships" : "Edit Relationships"}
                  </button>
                </>
              )}

            </motion.div>

          </motion.div>

          <button
            onClick={async () => {
              saveRelationships();
            }}
            className="mt-4 w-full py-2 rounded bg-blue-600 text-white"
          >
            Save Current Diagram
          </button>

          {/* Previous Saves */}
          <div className="mt-4 max-h-48 overflow-y-auto space-y-2 border-t pt-3">
            <h2 className="font-semibold text-lg">Previous Saves</h2>

            {previousSaves
              ?.slice()
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .map((save) => (
                <button
                  key={save._id}
                  className="w-full text-left text-sm p-2 rounded hover:bg-zinc-200"
                  onClick={() => loadRelationships({ saveId: save._id })}
                >
                  {new Date(save.timestamp).toLocaleString()}
                </button>
              ))}

            {!previousSaves?.length && (
              <p className="text-xs text-zinc-500 italic">
                No saved snapshots yet.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* REACTFLOW WORKSPACE */}
      <main className="flex-1 h-full">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            className="bg-white dark:bg-zinc-800"
            onNodeClick={onNodeClick}
            nodesConnectable={false}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
          />
        </ReactFlowProvider>
      </main>

    </div>
  );
}
