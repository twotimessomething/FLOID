// Phase colors for the industrial design process
export const PHASE_COLORS = {
  discovery: '#6366F1', // Indigo
  concept: '#8B5CF6', // Violet
  design: '#EC4899', // Pink
  engineering: '#F59E0B', // Amber
  production: '#10B981', // Emerald
};

// Team colors palette
export const TEAM_COLORS = [
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#f43f5e', // rose-500
  '#6366f1', // indigo-500
];

export const getTeamColor = (index: number): string => {
  return TEAM_COLORS[index % TEAM_COLORS.length];
};
