/**
 * PDP (Stage-Gate) template - MASTER for Complete Product Development.
 * All other aligned templates sync to these gate positions.
 *
 * Gate 0: 0.10 - Idea Screen (Idea -> Scoping)
 * Gate 1: 0.20 - Business Case (Scoping -> Development)
 * Gate 2: 0.35 - Development Approval (Business Case -> Dev)
 * Gate 3: 0.60 - Testing/Validation (Dev -> Test)
 * Gate 4: 0.85 - Launch Decision (Test -> Launch)
 * Gate 5: 0.98 - Post-Launch
 */

import type { ScheduleTemplate } from '../types';

export const pdpAlignedTemplate: ScheduleTemplate = {
  id: 'pdp-aligned',
  name: 'PDP Master',
  description: 'Stage-Gate Product Development Process with formal decision gates',
  icon: 'clipboard',
  category: 'team',
  suggestedAsMaster: true,
  defaultColor: '#F59E0B', // Amber
  phases: [
    {
      name: 'Discovery',
      description: 'Ideation, opportunity identification, and initial screening',
      relativeStart: 0.0,
      relativeEnd: 0.10,
      order: 0,
      tasks: [
        {
          name: 'Blue Sky Ideation',
          description: 'Open brainstorming and trend analysis',
          relativeStart: 0.0,
          relativeEnd: 0.6,
          order: 0,
        },
        {
          name: 'Sketching & Concepts',
          description: 'High-level concept visualization',
          relativeStart: 0.3,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Gate 0 Prep',
          description: 'Prepare for Idea Screen',
          relativeStart: 0.8,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Scoping',
      description: 'Preliminary market and technical assessment',
      relativeStart: 0.10,
      relativeEnd: 0.20,
      order: 1,
      tasks: [
        {
          name: 'Technical Feasibility',
          description: 'Can we build it? Initial engineering assessment',
          relativeStart: 0.0,
          relativeEnd: 0.7,
          order: 0,
        },
        {
          name: 'Market Pulse',
          description: 'Is there a market? Initial customer check',
          relativeStart: 0.2,
          relativeEnd: 0.6,
          order: 1,
        },
        {
          name: 'Gate 1 Prep',
          description: 'Prepare for Business Case approval',
          relativeStart: 0.7,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Business Case',
      description: 'Detailed project definition and rigorous financial analysis',
      relativeStart: 0.20,
      relativeEnd: 0.35,
      order: 2,
      tasks: [
        {
          name: 'Product Definition',
          description: 'Detailed PRD and specs',
          relativeStart: 0.0,
          relativeEnd: 0.6,
          order: 0,
        },
        {
          name: 'Financial Modeling',
          description: 'NPV, ROI, and Margin analysis',
          relativeStart: 0.4,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Project Plan',
          description: 'Resource allocation and timeline creation',
          relativeStart: 0.5,
          relativeEnd: 0.9,
          order: 2,
        },
        {
          name: 'Gate 2 Prep',
          description: 'Go/Kill decision package for development funding',
          relativeStart: 0.8,
          relativeEnd: 1.0,
          order: 3,
        },
      ],
    },
    {
      name: 'Development',
      description: 'Design, Engineering, and Prototyping (The heavy lifting)',
      relativeStart: 0.35,
      relativeEnd: 0.60,
      order: 3,
      tasks: [
        {
          name: 'Detailed Design',
          description: 'CAD, EE Layout, and SW Architecture',
          relativeStart: 0.0,
          relativeEnd: 0.5,
          order: 0,
        },
        {
          name: 'Prototyping (EVT)',
          description: 'Building and testing engineering units',
          relativeStart: 0.4,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Gate 3 Prep',
          description: 'Readiness for Design Validation',
          relativeStart: 0.9,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Testing & Validation',
      description: 'Validation (DVT/PVT) and Certification',
      relativeStart: 0.60,
      relativeEnd: 0.85,
      order: 4,
      tasks: [
        {
          name: 'Design Validation (DVT)',
          description: 'Reliability and destructive testing',
          relativeStart: 0.0,
          relativeEnd: 0.5,
          order: 0,
        },
        {
          name: 'Certification',
          description: 'Regulatory approvals',
          relativeStart: 0.3,
          relativeEnd: 0.7,
          order: 1,
        },
        {
          name: 'Production Validation (PVT)',
          description: 'Manufacturing line qualification',
          relativeStart: 0.6,
          relativeEnd: 0.9,
          order: 2,
        },
        {
          name: 'Gate 4 Prep',
          description: 'Launch readiness review',
          relativeStart: 0.9,
          relativeEnd: 1.0,
          order: 3,
        },
      ],
    },
    {
      name: 'Launch',
      description: 'Production Ramp and Commercial Launch',
      relativeStart: 0.85,
      relativeEnd: 1.0,
      order: 5,
      tasks: [
        {
          name: 'Production Ramp',
          description: 'Volume manufacturing',
          relativeStart: 0.0,
          relativeEnd: 0.6,
          order: 0,
        },
        {
          name: 'Commercial Launch',
          description: 'Marketing go-live and sales start',
          relativeStart: 0.2,
          relativeEnd: 0.7,
          order: 1,
        },
        {
          name: 'Post-Launch Review',
          description: 'Gate 5 - Lessons learned',
          relativeStart: 0.9,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
  ],
  milestones: [
    {
      name: 'Gate 0',
      description: 'Idea Screen - Go to Scoping',
      relativePosition: 0.10,
      order: 0,
    },
    {
      name: 'Gate 1',
      description: 'Business Case - Go to Detailed Planning',
      relativePosition: 0.20,
      order: 1,
    },
    {
      name: 'Gate 2',
      description: 'Development - Go to Spend Money',
      relativePosition: 0.35,
      order: 2,
    },
    {
      name: 'Gate 3',
      description: 'Testing - Go to Validation',
      relativePosition: 0.60,
      order: 3,
    },
    {
      name: 'Gate 4',
      description: 'Launch - Go to Market',
      relativePosition: 0.85,
      order: 4,
    },
    {
      name: 'Gate 5',
      description: 'Post-Mortem',
      relativePosition: 0.98,
      order: 5,
    },
  ],
};
