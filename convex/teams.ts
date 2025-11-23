import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("teams").collect();
  },
});

// convex/teams.ts
export const updateDeliverables = mutation({
  args: {
    team: v.string(),
    deliverables: v.array(v.object({
      text: v.string(),
      deliver_to: v.string(),
      status: v.string()
    }))
  },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .filter(q => q.eq(q.field("team"), args.team))
      .unique();

    if (!team) return;

    await ctx.db.patch(team._id, {
      deliverables: args.deliverables
    });
  }
});

export const updatePosition = mutation({
  args: {
    id: v.id("teams"),
    x: v.float64(),
    y: v.float64(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      position_x: args.x,
      position_y: args.y,
    });
  },
});
