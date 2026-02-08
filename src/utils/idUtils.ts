/**
 * Generate a random alphanumeric ID string.
 * Used for creating unique identifiers for sections, phases, tasks, milestones, etc.
 */
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};
