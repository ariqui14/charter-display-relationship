import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teams: defineTable({
    team: v.string(),
    // Deliverables are an array of objects:
    deliverables: v.optional(
      v.array(
        v.object({
          text: v.string(),
          deliver_to: v.string(),
          status: v.string(),
        })
      )
    ),
    // Node position in ReactFlow (optional to avoid breaking old data)
    position_x: v.optional(v.float64()),
    position_y: v.optional(v.float64()),
  }),

  previous_saves: defineTable({
  timestamp: v.string(),
  snapshot: v.array(v.any()),   // snapshot is arbitrary JSON
}),

});

