import { addMonths } from 'date-fns';

/**
 * Create default section date range: 1st of current month to 12 months later.
 */
export const createDefaultSectionDateRange = (): { startDate: string; endDate: string } => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = addMonths(startDate, 12);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};
