import { useMemo } from 'react';
import { useSectionStore, selectMasterSection } from '../stores/sectionStore';
import type { Section, Phase, Task, Milestone } from '../types';
import { getPhaseColor } from '../types';
import { parseISO, differenceInDays, addDays } from 'date-fns';

export interface StatusItem {
  id: string;
  name: string;
  color: string;
  sectionId: string;
  sectionName: string;
  sectionOrder: number;
  phaseId?: string;
  phaseName?: string;
  phaseOrder?: number;
  taskOrder?: number;
  absoluteStart: number;
  absoluteEnd: number;
  date?: Date;
}

export interface MilestoneItem {
  id: string;
  name: string;
  color: string;
  sectionName: string;
  relativePosition: number;
  date: Date;
}

export interface TimelineStatus {
  inFlight: StatusItem[];
  nextUp: StatusItem[];
  upcomingMilestones: MilestoneItem[];
  todayPosition: number;
}

function getTodayPositionInSection(section: Section): number {
  const start = parseISO(section.startDate).getTime();
  const end = parseISO(section.endDate).getTime();
  const today = new Date().getTime();

  const position = (today - start) / (end - start);
  return Math.max(0, Math.min(1, position));
}

function sectionPositionToDate(position: number, section: Section): Date {
  const start = parseISO(section.startDate);
  const end = parseISO(section.endDate);
  const days = differenceInDays(end, start);
  return addDays(start, Math.round(position * days));
}

export function useTimelineStatus(): TimelineStatus {
  const sections = useSectionStore((state) => state.sections);
  const masterSection = useSectionStore(selectMasterSection);

  return useMemo(() => {
    // Get today's position relative to the master section
    const todayPosition = masterSection ? getTodayPositionInSection(masterSection) : 0.5;

    const inFlight: StatusItem[] = [];
    const nextUp: StatusItem[] = [];
    const upcomingMilestones: MilestoneItem[] = [];

    // Track one next-up per section
    const nextUpBySection: Map<string, StatusItem> = new Map();
    // Track one upcoming milestone per section
    const milestoneBySection: Map<string, MilestoneItem> = new Map();

    sections.forEach((section: Section) => {
      // Get today's position relative to this section
      const sectionTodayPosition = getTodayPositionInSection(section);

      section.phases.forEach((phase: Phase) => {
        const phaseColor = getPhaseColor(phase, section);

        // Check if phase has tasks
        if (phase.tasks.length > 0) {
          // Process tasks - convert relative-to-phase to section-relative
          phase.tasks.forEach((task: Task) => {
            const phaseWidth = phase.relativeEnd - phase.relativeStart;
            const absoluteStart = phase.relativeStart + task.relativeStart * phaseWidth;
            const absoluteEnd = phase.relativeStart + task.relativeEnd * phaseWidth;

            const item: StatusItem = {
              id: task.id,
              name: task.name,
              color: phaseColor,
              sectionId: section.id,
              sectionName: section.name,
              sectionOrder: section.order,
              phaseId: phase.id,
              phaseName: phase.name,
              phaseOrder: phase.order,
              taskOrder: task.order,
              absoluteStart,
              absoluteEnd,
            };

            // In flight: today is within bounds (relative to this section)
            if (sectionTodayPosition >= absoluteStart && sectionTodayPosition <= absoluteEnd) {
              inFlight.push(item);
            }
            // Next up: starts after today
            else if (absoluteStart > sectionTodayPosition) {
              const existing = nextUpBySection.get(section.id);
              if (!existing || absoluteStart < existing.absoluteStart) {
                item.date = sectionPositionToDate(absoluteStart, section);
                nextUpBySection.set(section.id, item);
              }
            }
          });
        } else {
          // No tasks - use the phase itself
          const item: StatusItem = {
            id: phase.id,
            name: phase.name,
            color: phaseColor,
            sectionId: section.id,
            sectionName: section.name,
            sectionOrder: section.order,
            phaseId: phase.id,
            phaseName: phase.name,
            phaseOrder: phase.order,
            absoluteStart: phase.relativeStart,
            absoluteEnd: phase.relativeEnd,
          };

          // In flight: today is within bounds
          if (sectionTodayPosition >= phase.relativeStart && sectionTodayPosition <= phase.relativeEnd) {
            inFlight.push(item);
          }
          // Next up: starts after today
          else if (phase.relativeStart > sectionTodayPosition) {
            const existing = nextUpBySection.get(section.id);
            if (!existing || phase.relativeStart < existing.absoluteStart) {
              item.date = sectionPositionToDate(phase.relativeStart, section);
              nextUpBySection.set(section.id, item);
            }
          }
        }
      });

      // Process milestones
      section.milestones.forEach((milestone: Milestone) => {
        if (milestone.relativePosition > sectionTodayPosition) {
          const existing = milestoneBySection.get(section.id);
          if (!existing || milestone.relativePosition < existing.relativePosition) {
            milestoneBySection.set(section.id, {
              id: milestone.id,
              name: milestone.name,
              color: section.color,
              sectionName: section.name,
              relativePosition: milestone.relativePosition,
              date: sectionPositionToDate(milestone.relativePosition, section),
            });
          }
        }
      });
    });

    // Sort in-flight items by section order, phase order, task order
    inFlight.sort((a, b) => {
      if (a.sectionOrder !== b.sectionOrder) return a.sectionOrder - b.sectionOrder;
      if ((a.phaseOrder ?? 0) !== (b.phaseOrder ?? 0)) return (a.phaseOrder ?? 0) - (b.phaseOrder ?? 0);
      return (a.taskOrder ?? 0) - (b.taskOrder ?? 0);
    });

    // Collect next-up items sorted by section order
    nextUpBySection.forEach((item) => nextUp.push(item));
    nextUp.sort((a, b) => a.sectionOrder - b.sectionOrder);

    // Collect milestones sorted by date
    milestoneBySection.forEach((item) => upcomingMilestones.push(item));
    upcomingMilestones.sort((a, b) => a.relativePosition - b.relativePosition);

    return {
      inFlight,
      nextUp,
      upcomingMilestones,
      todayPosition,
    };
  }, [sections, masterSection]);
}
