/**
 * Software template aligned to PDP gates.
 *
 * Alignment:
 * - Requirements & Platform: 0.10 - 0.35 (Waiting for HW architecture)
 * - Board Bring-up & Drivers: 0.35 - 0.55 (Aligned with EVT)
 * - Application Logic: 0.45 - 0.75 (Parallel with DVT)
 * - Stabilization & Beta: 0.70 - 0.90 (Aligned with PVT)
 * - Day 1 Patch: 0.90 - 1.0
 */

import type { ScheduleTemplate } from '../types';

export const softwareAlignedTemplate: ScheduleTemplate = {
  id: 'software-aligned',
  name: 'Software / Firmware',
  description: 'Embedded and App development cycle aligned with hardware validation',
  icon: 'code',
  category: 'team',
  defaultColor: '#3B82F6', // Blue
  phases: [
    {
      name: 'Platform Definition',
      description: 'Selecting the OS, BSP, and define cloud architecture',
      relativeStart: 0.10, // Starts after some HW definition
      relativeEnd: 0.35,
      order: 0,
      tasks: [
        {
          name: 'Tech Stack Selection',
          description: 'OS (RTOS/Linux), Language, and Cloud Provider selection',
          relativeStart: 0.0,
          relativeEnd: 0.4,
          order: 0,
        },
        {
          name: 'BSP Development',
          description: 'Initial Board Support Package setup on dev kits',
          relativeStart: 0.3,
          relativeEnd: 1.0,
          order: 1,
        },
      ],
    },
    {
      name: 'Board Bring-up',
      description: 'Getting life out of the first custom PCBs (EVT HW)',
      relativeStart: 0.35,
      relativeEnd: 0.55,
      order: 1,
      tasks: [
        {
          name: 'Bootloader & Power',
          description: 'Verify power rails, clocks, and boot sequence',
          relativeStart: 0.0,
          relativeEnd: 0.3,
          order: 0,
        },
        {
          name: 'Driver Development',
          description: 'Writing drivers for sensors, displays, and radios',
          relativeStart: 0.2,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'EVT Validation Support',
          description: 'Test scripts to help H/W team validate EVT units',
          relativeStart: 0.4,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Application Core',
      description: 'Building the actual product features',
      relativeStart: 0.45,
      relativeEnd: 0.75,
      order: 2,
      tasks: [
        {
          name: 'Core Services',
          description: 'Connectivity, OTA, and Data management services',
          relativeStart: 0.0,
          relativeEnd: 0.5,
          order: 0,
        },
        {
          name: 'UI/UX Implementation',
          description: 'Implementing the frontend styling and interaction flow',
          relativeStart: 0.3,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Cloud Integration',
          description: 'End-to-end data flow with backend',
          relativeStart: 0.5,
          relativeEnd: 0.9,
          order: 2,
        },
      ],
    },
    {
      name: 'Stabilization',
      description: 'Bug crushing and performance tuning',
      relativeStart: 0.70,
      relativeEnd: 0.90,
      order: 3,
      tasks: [
        {
          name: 'Alpha / Dogfood',
          description: 'Internal testing on DVT units',
          relativeStart: 0.0,
          relativeEnd: 0.4,
          order: 0,
        },
        {
          name: 'Beta Testing',
          description: 'External user testing (limited cohort)',
          relativeStart: 0.4,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Power Optimization',
          description: 'Sleep modes and battery life tuning',
          relativeStart: 0.2,
          relativeEnd: 0.7,
          order: 2,
        },
      ],
    },
    {
      name: 'Golden Master',
      description: 'Final firmware for the factory line',
      relativeStart: 0.85,
      relativeEnd: 0.95,
      order: 4,
      tasks: [
        {
          name: 'Factory Firmware',
          description: 'Firmware image for mass production flashing',
          relativeStart: 0.0,
          relativeEnd: 0.5, // Critical to lock before MP
          order: 0,
        },
        {
          name: 'Day 0 OTA',
          description: 'The update awaiting users out of the box',
          relativeStart: 0.4,
          relativeEnd: 1.0,
          order: 1,
        },
      ],
    },
  ],
  milestones: [
    {
      name: 'Board Alive',
      description: 'First EVT unit boots successfully',
      relativePosition: 0.38,
      order: 0,
    },
    {
      name: 'Feature Complete',
      description: 'All p0/p1 features coded, alpha ready',
      relativePosition: 0.70,
      order: 1,
    },
    {
      name: 'Code Freeze',
      description: 'No new logic changes, only critical bug fixes',
      relativePosition: 0.88,
      order: 2,
    },
    {
      name: 'GM Release',
      description: 'Golden Master firmware signed for factory',
      relativePosition: 0.92,
      order: 3,
    },
  ],
};
