//This and teams.ts can be collapsed more cleanly into a single schema.ts file
import { mutation, query } from "./_generated/server";
import { asObjectValidator, v } from "convex/values";

export const saveRelationships = mutation({
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    const snapshot = teams.map(({_id, _creationTime, ...team}) => team);

    await ctx.db.insert("previous_saves", {
      timestamp: new Date().toISOString(),
      snapshot
    });
  }
});

export const getSavedTimestamps = query({
    handler: async (ctx) => {
        return await ctx.db.query("previous_saves").collect();
    }
});

//Helper function to sanitize snapshots before reinserting into database and reloading
function cleanConvexFields(obj: any):any{
    if(Array.isArray(obj)){
        return obj.map(cleanConvexFields);
    }

    if(obj !== null && typeof obj === "object"){
        const {_id, _creationTime, ...rest} = obj;
        const cleaned: any = {};
        for(const key in rest){
            cleaned[key] = cleanConvexFields(rest[key]);

        }
        return cleaned;
    }

    return obj;
}

export const loadRelationships = mutation({
    args: {
        saveId: v.id("previous_saves")
    },
    handler: async(ctx, args) => {
        const save = await ctx.db.get(args.saveId);
        if (!save || !save.snapshot) return;

        //Delete existing teams
        const existingTeams = await ctx.db.query("teams").collect();

        for (const team of existingTeams){
            await ctx.db.delete(team._id);
        }

        //Clean snapshot of all convex fields
        const cleanedSnapshot = cleanConvexFields(save.snapshot);

        //Reinsert teams from snapshot
        for (const team of cleanedSnapshot){
            await ctx.db.insert("teams", team);
        }
    }
})