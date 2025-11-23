'use client';

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { getLayoutedElements } from "./layout/elkLayout";
import { useMutation } from "convex/react";
import SelfLoopEdge from "./SelfLoopEdge";
import { Id } from "../convex/_generated/dataModel";
 
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  Edge,
  useReactFlow,
  MarkerType
} from "reactflow";

import "reactflow/dist/style.css";
import '@xyflow/react/dist/style.css';

// Animations
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.5 }
  }
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

//Helper Function for visual relationship clarity
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
  type TeamNode = {
    id: string;
    position: { x: number; y: number };
    data: { label: string; deliverables?: any[] };
    type?: string;
  };

  const teams = useQuery(api.teams.get);
  const [nodes, setNodes] = useState<TeamNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

 
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any | null>(null);
  const [layoutApplied, setLayoutApplied] = useState(false); 
  const { fitView } = useReactFlow();

  //Variables for Clicking Nodes

  const onNodeClick = useCallback((_: any, node: any) => { 
    setSelectedNodeId(node.id);  
    setSidebarOpen(true); 
  },[])

  const [editMode, setEditMode] = useState(false);
  const [editedDeliverables, setEditedDeliverables] = useState<any[]>([]);

  //Hooks

    //Mutations
  const updateDeliverables = useMutation(api.teams.updateDeliverables);
  const saveRelationships = useMutation(api.previous_saves.saveRelationships);
  const loadRelationships = useMutation(api.previous_saves.loadRelationships);
  const updatePosition = useMutation(api.teams.updatePosition);

    //Queries
  const previousSaves = useQuery(api.previous_saves.getSavedTimestamps);


  // Build nodes and edges from DB
  useEffect(() => {
    if (!teams) return;

    // Use Convex document `_id` as the ReactFlow node id so we can persist
    // positions from the DB and update them without the graph snapping back.
    const mappedNodes: TeamNode[] = teams.map((t) => {
      const isNextPhase = t.team === "NEXT PHASE";
      // Accept 'Testing' or 'TESTING' (case-insensitive) as the special node
      const isTesting = (t.team || "").toString().toUpperCase() === "TESTING";
      return {
        id: t._id,
        position: {
          x: t.position_x ?? 0,
          y: t.position_y ?? 0,
        },
        data: { label: t.team, deliverables: t.deliverables },
        type: "default",
        // Lock both NEXT PHASE and TESTING so they cannot be dragged
        draggable: !isNextPhase && !isTesting,
        // Special visual styling for the NEXT PHASE and TESTING nodes
        style: isNextPhase || isTesting
          ? {
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
              background: "#e0f2fe", // light blue background
            }
          : undefined,
      };
    });

    // Ensure the NEXT PHASE node is placed below all other nodes and
    // the TESTING node is centered among all other nodes.
    const otherNodes = mappedNodes.filter(
      (n) => {
        const label = (n.data?.label || "").toString().toUpperCase();
        return label !== "NEXT PHASE" && label !== "TESTING";
      }
    );

    if (otherNodes.length > 0) {
      const maxY = otherNodes.reduce((m, n) => Math.max(m, n.position.y ?? 0), 0);
      const meanX = Math.round(
        otherNodes.reduce((s, n) => s + (n.position.x ?? 0), 0) / otherNodes.length
      );

      // compute bounding box to place TESTING in the geometric center
      const xs = otherNodes.map((n) => n.position.x ?? 0);
      const ys = otherNodes.map((n) => n.position.y ?? 0);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxYBox = Math.max(...ys);
      const centerX = Math.round((minX + maxX) / 2) || meanX || 400;
      const centerY = Math.round((minY + maxYBox) / 2) || Math.round(maxY / 2) || 300;

      const newNodes = mappedNodes.map((n) => {
        const label = (n.data?.label || "").toString().toUpperCase();

        if (label === "NEXT PHASE") {
          return {
            ...n,
            position: {
              x: meanX || n.position.x || 0,
              y: maxY + 220,
            },
          };
        }

        if (label === "TESTING") {
          return {
            ...n,
            draggable: false,
            position: {
              x: centerX,
              y: centerY,
            },
          };
        }

        return n;
      });

      // replace mappedNodes with positioned special nodes
      // @ts-ignore - reassign for continued usage
      mappedNodes.length = 0;
      newNodes.forEach((n) => mappedNodes.push(n));
    }

    // Build edges using node ids (team _id). The deliverables store the
    // human-readable `deliver_to` team name, so resolve that to the target _id.
    const edgeMap = new Map<string, Edge>();

    teams.forEach((team) => {
      team.deliverables?.forEach((deliverable: any) => {
        if (!deliverable.deliver_to) return;

        // Resolve source/target ids
        const sourceId = team._id;
        const targetTeam = teams.find((tt) => tt.team === deliverable.deliver_to);
        if (!targetTeam) return; // skip edges where we can't resolve the target team name
        const targetId = targetTeam._id;

        const edgeId = `${sourceId}->${targetId}`;

        if (!edgeMap.has(edgeId)) {
          const status = deliverable.status;
          const isSelfLoop = sourceId === targetId;

          edgeMap.set(edgeId, {
            id: edgeId,
            source: sourceId,
            target: targetId,
            type: isSelfLoop ? "self" : "smoothstep",
            animated: status === "in-progress",
            style: {
              stroke: getStatusStyles(status).background,
              strokeWidth: 3,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: getStatusStyles(status).background,
            },
            data: {
              status,
              text: deliverable.text,
            },
          });
        }
      });
    });

    setNodes(mappedNodes);
    setEdges(Array.from(edgeMap.values()));
    // If any team already has saved positions in the DB, don't run the layout
    // pass that would override them. Only run layout when no positions exist.
    const hasSavedPositions = teams.some(
      (t) => typeof t.position_x === "number" && typeof t.position_y === "number"
    );
    setLayoutApplied(hasSavedPositions);
  }, [teams]);

    const edgeTypes = { //For self referential Loops
        self: SelfLoopEdge
    };

//Detect if Edge is Connected
function isEdgeConnected(edge: Edge, nodeId: string | null) {
  if (!nodeId) return false;
  return edge.source === nodeId || edge.target === nodeId;
}

// Helper to resolve a team name from its Convex document _id.
function getTeamName(id: string | undefined | null) {
  if (!id) return "";
  return teams?.find((t) => t._id === id)?.team ?? id;
}

useEffect(() => {
  if (!selectedNodeId) return;
  if (isDragging) return; // don't run radial spread while user is actively dragging

    //---- Edge Styling and Label Updates
  setEdges((eds) =>
  eds.map((edge) => {
        const isConnected = isEdgeConnected(edge, selectedNodeId);
        const statusColor = getStatusStyles(edge.data?.status).background;
        const isInProgress = edge.data?.status === "in-progress";
        return {
            ...edge,
            // Keep edges with status 'in-progress' animated regardless of selection
            animated: isInProgress || isConnected,
            style: {
                stroke: statusColor,
                strokeWidth: isConnected ? 8 : 3,
                opacity: isConnected ? 1 : 0.7
            },
            label: isConnected
              ? `${getTeamName(edge.source)} → ${getTeamName(edge.target)} (${getDeliverableLabel(edge)})`
              : undefined,
    };
    })
  );
  // ----- Update Sidebar Team (selectedNodeId is a team _id)
  setSelectedTeam(teams?.find(t => t._id === selectedNodeId));

// ----- Radial Spread of Connected Nodes
setNodes((nds)=> {
    const connectedEdges = edges.filter(
        e=> e.source == selectedNodeId || e.target === selectedNodeId
    );

    const connectedNodeIds = new Set<string>();
    connectedEdges.forEach(e => {
        connectedNodeIds.add(e.source);
        connectedNodeIds.add(e.target);
    });

    const centerNode = nds.find(n=> n.id === selectedNodeId);
    if (!centerNode) return nds;

    const radius = 450;
    let angle = 0;
    const step = (2 * Math.PI) / connectedNodeIds.size;

    return nds.map((node) => {
        if (!connectedNodeIds.has(node.id) || node.id === selectedNodeId ||
        node.data?.label === "NEXT PHASE" //Want to keep Next Phase Locked at bottom, but rest of the teams can be moved around
        ){
            return node;
        }

        angle += step;

        return {
            ...node,
            position: {
                x: centerNode.position.x + Math.cos(angle) * radius,
                y: centerNode.position.y + Math.sin(angle) * radius
            }
        }
    })
}
)


}, [selectedNodeId, teams, isDragging]);

useEffect(() => {
  if (selectedTeam) {
    setEditedDeliverables(selectedTeam.deliverables || []);
    setEditMode(false);
  }
}, [selectedTeam]);

//Deliverable Label for labelling edge relationships
function getDeliverableLabel(edge: Edge) {
  if (!teams || !selectedNodeId) return null;

  // selectedNodeId is a team _id. Find the team and then search its deliverables.
  const team = teams.find((t) => t._id === selectedNodeId);
  if (!team || !team.deliverables) return null;

  // deliverable.deliver_to in the DB is a human-readable team name. Edge.target
  // is the target _id. Match either by target id or by resolving the target
  // team's name.
  const targetTeamName = teams.find((t) => t._id === edge.target)?.team;

  const deliverable = team.deliverables.find((d: any) =>
    d.deliver_to === edge.target || d.deliver_to === targetTeamName
  );

  return deliverable?.text || `TEAM EXPECTING DELIVERABLE`;
}

//Manually placing nodes. Final version would ideally be placed more dynamically and organized by relationship for easier viewing
function layoutNodesInGrid(nodes: TeamNode[], screenWidth = 1200) {
  const bottomLabels = ["Mission Management", "NEXT PHASE"];

  const bottomNodes = nodes.filter(n => bottomLabels.includes(n.data.label));
  const gridNodes = nodes.filter(n => !bottomLabels.includes(n.data.label));

  const nodeWidth = 300;
  const nodeHeight = 135;
  const gap = 180;

  const columns = Math.ceil(Math.sqrt(gridNodes.length));
  const rows = Math.ceil(gridNodes.length / columns);

  const startX = 100;
  const startY = 80;

  //Keep NEXT PHASE Node Locked to bottom

  

  // Grid layout
  const laidOutGrid = gridNodes.map((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);

    return {
      ...node,
      position: {
        x: startX + col * (nodeWidth + gap),
        y: startY + row * (nodeHeight + gap)
      }
    };
  });

  // Bottom nodes centered beneath the grid
const gridWidth = columns * (nodeWidth + gap);
const bottomY = startY + rows * (nodeHeight + gap) + 100;

const laidOutBottom = bottomNodes.map((node, index) => {
  // HARD LOCK NEXT PHASE NODE
  if (node.data.label === "NEXT PHASE") {
    return {
      ...node,
      draggable: false,
      position: {
        x: startX + gridWidth / 2, // dead center
        y: bottomY + 150           // slightly lower, always bottom
      }
    };
  }

  // Normal bottom node (Mission Management)
  return {
    ...node,
    position: {
      x: startX + gridWidth / 2 - nodeWidth + index * (nodeWidth + gap),
      y: bottomY
    }
  };
});

return [...laidOutGrid, ...laidOutBottom];

}


//Call Layout function to fit nodes horizontally

  useEffect(() => {
    if (isDragging) return; // avoid layouting while user is dragging
    if (!nodes.length || !edges.length || layoutApplied) return;

    const applyLayout = async () => {
        const { nodes: layoutedNodes, edges: layoutedEdges } =
        await getLayoutedElements(nodes, edges);

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setLayoutApplied(true);
    

        // FORCE ReactFlow to re-calculate viewport
        setTimeout(() => {
        fitView({ padding: 0.3, duration: 400 });
        }, 100);
    };

    applyLayout();
  }, [nodes, edges, layoutApplied, isDragging]);


  // Handlers
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((ns) => applyNodeChanges(changes as any, ns as any) as TeamNode[]),
    []
  );

  const onNodeDragStop = useCallback((_: any, node: TeamNode) => {
    // Node ids are Convex team _ids. Optimistically update local node position
    // so the UI doesn't snap back while the backend updates.

    // Find NEXT PHASE node to ensure we don't allow dropping at/under it.
    const nextPhase = nodes.find((n) => n.data?.label === "NEXT PHASE");
    let clampedY = node.position.y;
    const minY = nextPhase ? (nextPhase.position.y - 150) : -Infinity;
    if (clampedY >= minY) {
      clampedY = minY;
    }

    const newPos = { x: node.position.x, y: clampedY };

    setNodes((ns) =>
      ns.map((n) => (n.id === node.id ? { ...n, position: newPos } : n))
    );

    // Prevent nodes from being dragged into the TESTING node area.
    const testingNode = nodes.find((n) => (n.data?.label || "").toString().toUpperCase() === "TESTING");
    if (testingNode && testingNode.id !== node.id) {
      const dx = newPos.x - (testingNode.position.x ?? 0);
      const dy = newPos.y - (testingNode.position.y ?? 0);
      const dist = Math.hypot(dx, dy);
      const minDist = 220; // minimum separation from TESTING

      if (dist < minDist) {
        if (dist === 0) {
          newPos.x = (testingNode.position.x ?? 0) + minDist;
          newPos.y = testingNode.position.y ?? 0;
        } else {
          const nx = dx / dist;
          const ny = dy / dist;
          newPos.x = (testingNode.position.x ?? 0) + nx * minDist;
          newPos.y = (testingNode.position.y ?? 0) + ny * minDist;
        }

        // apply the adjusted position locally
        setNodes((ns) =>
          ns.map((n) => (n.id === node.id ? { ...n, position: newPos } : n))
        );
      }
    }

    updatePosition({
      id: node.id as Id<"teams">,
      x: newPos.x,
      y: newPos.y,
    });

    // clear dragging flag after stopping
    setIsDragging(false);

    console.log(`NODE POSITIONED. id: ${node.id} x: ${newPos.x}, y: ${newPos.y}`);
  }, [updatePosition, nodes]);


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

  const onNodeDragStart = useCallback((_: any, node: TeamNode) => {
    setIsDragging(true);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-zinc-100 dark:bg-black overflow-hidden">


  <div
    className="absolute top-0 left-0 h-full z-50 group"
    style={{ width: sidebarOpen ? "0px" : "20vw" }}  // 20% of screen
  >
 
    <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`absolute top-80 z-50 px-3 py-2 rounded bg-zinc-800 text-white hover:bg-zinc-700 transition-all duration-300
        ${sidebarOpen ? "opacity-100 left-96" : "opacity-0 group-hover:opacity-100"}`
        }
        style={{
        left: sidebarOpen ? "285px" : "0px"
        }}
        >
        {sidebarOpen ? "← Hide Panel" : "Show Panel →"}
    </button>
 
  </div>
 


    <div
    className={`transition-all duration-300 ease-in-out overflow-hidden ${
      sidebarOpen ? "w-96 pr-6" : "w-0"
    }`}
    > 
      {/* Left Sidebar */}
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

          {/* Teams List */}
          <motion.div variants={item} className="space-y-2">
            {/* Sidebar Content */}
 

            {!selectedTeam && (
                <>
                <h2 className="font-semibold text-lg text-zinc-700 dark:text-zinc-200">
                    Teams
                </h2>
                {teams?.map(({ team }) => (
                    <div key={team} className="text-zinc-600 dark:text-zinc-300">
                    {team}
                    </div>
                ))}
                </>
            )}

            {selectedTeam && (
  <>
    <h2 className="font-bold text-xl text-zinc-800 dark:text-zinc-100">
      {selectedTeam.team}
    </h2>

    <div className="space-y-3">
      {editedDeliverables.map((d, index) => (
        <div key={index} className="p-3 rounded bg-zinc-100 dark:bg-zinc-800 space-y-2">

          {/* DELIVERABLE TEXT */}
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
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-zinc-500">Deliver to: {d.deliver_to}</p>
          )}

          {/* STATUS */}
          {editMode ? (
            <select
              className="w-full p-2 rounded text-sm"
              value={d.status}
              onChange={(e) => {
                const updated = [...editedDeliverables];
                updated[index].status = e.target.value;
                setEditedDeliverables(updated);
              }}
            >
              <option value="complete">complete</option>
              <option value="in-progress">in-progress</option>
              <option value="blocked">blocked</option>
            </select>
          ) : (
            <p className="text-xs">
              <span
                style={{
                  background: getStatusStyles(d.status).background,
                  color: getStatusStyles(d.status).color,
                  padding: "4px 8px",
                  borderRadius: 8,
                  fontWeight: 700,
                  textTransform: "capitalize",
                  display: "inline-block",
                }}
              >
                {d.status}
              </span>
            </p>
          )}

        </div>
      ))}
    </div>

    {/* BUTTON */}
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
      className="mt-4 w-full py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
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
      className="mt-4 w-full py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
    >
      {"Save Relationships"}
    </button>

    {/* Previous Saves List */}
    <div className="mt-4 max-h-48 overflow-y-auto space-y-2 border-t pt-3">
        <h2 className="font-semibold text-lg text-zinc-700 dark:text-zinc-200">
            Previous Saves
        </h2>
        {previousSaves?.map((save) => (
            <button
            key={save._id}
            className="w-full text-left text-sm p-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
            onClick={() => loadRelationships({ saveId: save._id})}

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
      {/* ReactFlow Main Area */}
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
            nodesConnectable = {false}     //Relationships only editable from side panel, not drawn from Node to Node
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}

          />
        </ReactFlowProvider>
      </main>

    </div>
  );
}
