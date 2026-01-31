import { useEffect, useRef } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useProjectStore } from '../stores/projectStore';
import { useTeamStore } from '../stores/teamStore';
import { saveToStorage } from '../utils/storageUtils';

const DEBOUNCE_MS = 1000;

export function useAutoSave() {
  const { phases, isInitialized } = useTimelineStore();
  const { project } = useProjectStore();
  const { teams } = useTeamStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isInitialized) return;

    // Debounce the save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveToStorage({
        project,
        phases,
        teams,
        version: 1,
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [phases, project, teams, isInitialized]);
}
