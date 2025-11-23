import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useSaves() {
  const previousSaves = useQuery(api.previous_saves.getSavedTimestamps);

  const saveRelationships = useMutation(api.previous_saves.saveRelationships);
  const loadRelationships = useMutation(api.previous_saves.loadRelationships);

  return {
    previousSaves: previousSaves ?? [],
    saveRelationships,
    loadRelationships,
  };
}
