import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useTeams() {
  const teams = useQuery(api.teams.get);

  const updateDeliverables = useMutation(api.teams.updateDeliverables);
  const updatePosition = useMutation(api.teams.updatePosition);

  return {
    teams: teams ?? [],
    updateDeliverables,
    updatePosition,
  };
}
