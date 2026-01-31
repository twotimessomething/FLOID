import { useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import type { Section, Phase, Element, Milestone } from '../types';
import { getPhaseColor } from '../types';

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
  elementOrder?: number;
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

function getTodayPosition(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const today = new Date().getTime();

  const position = (today - start) / (end - start);
  return Math.max(0, Math.min(1, position));
}

function positionToDate(position: number, startDate: string, endDate: string): Date {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const timestamp = start + position * (end - start);
  return new Date(timestamp);
}

export function useTimelineStatus(): TimelineStatus {
  const project = useProjectStore((state) => state.project);
  const sections = useSectionStore((state) => state.sections);

  return useMemo(() => {
    const todayPosition = getTodayPosition(project.startDate, project.endDate);

    const inFlight: StatusItem[] = [];
    const nextUp: StatusItem[] = [];
    const upcomingMilestones: MilestoneItem[] = [];

    // Track one next-up per section
    const nextUpBySection: Map<string, StatusItem> = new Map();
    // Track one upcoming milestone per section
    const milestoneBySection: Map<string, MilestoneItem> = new Map();

    sections.forEach((section: Section) => {
      section.phases.forEach((phase: Phase) => {
        const phaseColor = getPhaseColor(phase, section);

        // Check if phase has elements
        if (phase.elements.length > 0) {
          // Process elements - convert relative-to-phase to absolute
          phase.elements.forEach((element: Element) => {
            const phaseWidth = phase.relativeEnd - phase.relativeStart;
            const absoluteStart = phase.relativeStart + element.relativeStart * phaseWidth;
            const absoluteEnd = phase.relativeStart + element.relativeEnd * phaseWidth;

            const item: StatusItem = {
              id: element.id,
              name: element.name,
              color: phaseColor,
              sectionId: section.id,
              sectionName: section.name,
              sectionOrder: section.order,
              phaseId: phase.id,
              phaseName: phase.name,
              phaseOrder: phase.order,
              elementOrder: element.order,
              absoluteStart,
              absoluteEnd,
            };

            // In flight: today is within bounds
            if (todayPosition >= absoluteStart && todayPosition <= absoluteEnd) {
              inFlight.push(item);
            }
            // Next up: starts after today
            else if (absoluteStart > todayPosition) {
              const existing = nextUpBySection.get(section.id);
              if (!existing || absoluteStart < existing.absoluteStart) {
                item.date = positionToDate(absoluteStart, project.startDate, project.endDate);
                nextUpBySection.set(section.id, item);
              }
            }
          });
        } else {
          // No elements - use the phase itself
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
          if (todayPosition >= phase.relativeStart && todayPosition <= phase.relativeEnd) {
            inFlight.push(item);
          }
          // Next up: starts after today
          else if (phase.relativeStart > todayPosition) {
            const existing = nextUpBySection.get(section.id);
            if (!existing || phase.relativeStart < existing.absoluteStart) {
              item.date = positionToDate(phase.relativeStart, project.startDate, project.endDate);
              nextUpBySection.set(section.id, item);
            }
          }
        }
      });

      // Process milestones
      section.milestones.forEach((milestone: Milestone) => {
        if (milestone.relativePosition > todayPosition) {
          const existing = milestoneBySection.get(section.id);
          if (!existing || milestone.relativePosition < existing.relativePosition) {
            milestoneBySection.set(section.id, {
              id: milestone.id,
              name: milestone.name,
              color: section.color,
              sectionName: section.name,
              relativePosition: milestone.relativePosition,
              date: positionToDate(milestone.relativePosition, project.startDate, project.endDate),
            });
          }
        }
      });
    });

    // Sort in-flight items by section order, phase order, element order
    inFlight.sort((a, b) => {
      if (a.sectionOrder !== b.sectionOrder) return a.sectionOrder - b.sectionOrder;
      if ((a.phaseOrder ?? 0) !== (b.phaseOrder ?? 0)) return (a.phaseOrder ?? 0) - (b.phaseOrder ?? 0);
      return (a.elementOrder ?? 0) - (b.elementOrder ?? 0);
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
  }, [project.startDate, project.endDate, sections]);
}
