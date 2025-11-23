'use client';

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { getLayoutedElements } from "./layout/elkLayout";
import { useMutation } from "convex/react";
import SelfLoopEdge from "./SelfLoopEdge";
 
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  Edge,
  useReactFlow
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
function getStatusColor(status?: string) {
  switch (status) {
    case "complete":
      return "#16a34a"; // green
    case "in-progress":
      return "#facc15"; // yellow
    case "not-started":
    default:
      return "#64748b"; // gray
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
    //Queries
  const previousSaves = useQuery(api.previous_saves.getSavedTimestamps);


  // Build nodes and edges from DB
    useEffect(() => {
        if (!teams) return;

  // ---------- NODES ----------
    const rawNodes: TeamNode[] = teams.map((t) => ({
        id: t.team,
        position: { x: 0, y: 0 },
        data: { label: t.team, deliverables: t.deliverables },
        type: "default",
        draggable: t.team !== "NEXT PHASE"   // 🔒 locked node
    }));

    const positionedNodes = layoutNodesInGrid(rawNodes);

  // ---------- EDGES ----------
    const edgeMap = new Map<string, Edge>();

    teams.forEach((team) => {
        team.deliverables?.forEach((deliverable: any) => {
        if (!deliverable.deliver_to) return;

        const edgeId = `${team.team}->${deliverable.deliver_to}`;

        if (!edgeMap.has(edgeId)) {
            const status = deliverable.status;
            const isSelfLoop = team.team === deliverable.deliver_to;

            edgeMap.set(edgeId, {
                id: edgeId,
                source: team.team,
                target: deliverable.deliver_to,
                type: isSelfLoop ? "self" : "smoothstep",
                animated: status === "in-progress",
                style: {
                    stroke: getStatusColor(status),
                    strokeWidth: 3
                },
                markerEnd: {
                type: "arrowclosed",
                width: 20,
                height: 20,
                color: getStatusColor(status)
                },
                data: {
                    status,
                    text: deliverable.text
                }
            });
        }
        });
    });

    setNodes(positionedNodes);
    setEdges(Array.from(edgeMap.values()));
    setLayoutApplied(true);
}, [teams]);

    const edgeTypes = { //For self referential Loops
        self: SelfLoopEdge
    };

//Detect if Edge is Connected
function isEdgeConnected(edge: Edge, nodeId: string | null) {
  if (!nodeId) return false;
  return edge.source === nodeId || edge.target === nodeId;
}

useEffect(() => {
  if (!selectedNodeId) return;

    //---- Edge Styling and Label Updates
  setEdges((eds) =>
    eds.map((edge) => {
        const isConnected = isEdgeConnected(edge, selectedNodeId);
        const statusColor = getStatusColor(edge.data?.status);
        return {
            ...edge,
            animated: isConnected,
            style: {
                stroke: isConnected ? '#38bdf8' : statusColor,
                strokeWidth: isConnected ? 5 : 3,
                opacity: isConnected ? 1 : 0.7
            },
            label: isConnected
                ? `${edge.source} → ${edge.target} (${getDeliverableLabel(edge)})`
                : undefined,
            labelStyle: {
                fill: '#38bdf8',
                fontWeight: 600
            }
    };
    })
  );
  // ----- Update Sidebar Team
  setSelectedTeam(teams?.find(t => t.team === selectedNodeId));

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

    const radius = 300;
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


}, [selectedNodeId, teams]);

useEffect(() => {
  if (selectedTeam) {
    setEditedDeliverables(selectedTeam.deliverables || []);
    setEditMode(false);
  }
}, [selectedTeam]);

//Deliverable Label for labelling edge relationships
function getDeliverableLabel(edge: Edge) {
  if (!teams || !selectedNodeId) return null;

  const team = teams.find(t => t.team === selectedNodeId);
  if (!team || !team.deliverables) return null;

  const deliverable = team.deliverables.find(
    (d: any) => d.deliver_to === edge.target
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
  }, [nodes, edges, layoutApplied]);


  // Handlers
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((ns) => applyNodeChanges(changes as any, ns as any) as TeamNode[]),
    []
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
            <p className="text-xs text-zinc-400">Status: {d.status}</p>
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
            nodesConnectable = {false}     

          />
        </ReactFlowProvider>
      </main>

    </div>
  );
}
