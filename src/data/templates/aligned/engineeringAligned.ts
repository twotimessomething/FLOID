/**
 * Engineering template aligned to PDP gates.
 *
 * Alignment:
 * - Feasibility & Architecture: 0.05 - 0.20 (Starts slightly after initial discovery)
 * - Detailed Design & CAD: 0.15 - 0.40 (Heavy overlap with ID Refinement)
 * - EVT (Engineering Validation): 0.35 - 0.55 (First rigorous build)
 * - DVT (Design Validation): 0.55 - 0.75 (Certification & Reliability)
 * - PVT (Production Validation): 0.75 - 0.90 (Line qualification)
 * - Ramp & Sustaining: 0.90 - 1.0
 */

import type { ScheduleTemplate } from '../types';

export const engineeringAlignedTemplate: ScheduleTemplate = {
  id: 'engineering-aligned',
  name: 'Engineering',
  description: 'Hardware engineering cycle with rigorous EVT/DVT/PVT gates',
  icon: 'cog',
  category: 'team',
  defaultColor: '#10B981', // Emerald
  phases: [
    {
      name: 'Architecture & Feasibility',
      description: 'Defining the system architecture and deregistering critical path risks',
      relativeStart: 0.05,
      relativeEnd: 0.20,
      order: 0,
      tasks: [
        {
          name: 'Critical Component Selection',
          description: 'Selecting MCU, heavy hitters, and long-lead components',
          relativeStart: 0.0,
          relativeEnd: 0.5,
          order: 0,
        },
        {
          name: 'Proof of Concept (POC)',
          description: 'Breadboards and ugly rough prototypes to prove physics',
          relativeStart: 0.2,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'System Architecture',
          description: 'Block diagrams and preliminary BOM',
          relativeStart: 0.6,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Detailed Design',
      description: 'The meat of the engineering work - CAD, PCB layout, and simulation',
      relativeStart: 0.15,
      relativeEnd: 0.40,
      order: 1,
      tasks: [
        {
          name: 'ME/EE Integration',
          description: 'Iterative CAD/ECAD loops with Industrial Design',
          relativeStart: 0.0,
          relativeEnd: 0.7,
          order: 0,
        },
        {
          name: 'Thermal & Structural Analysis',
          description: 'Simulation (FEA/CFD) to validate theoretical performance',
          relativeStart: 0.3,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Tooling Kickoff',
          description: 'Cutting steel for long-lead hard tooling (T0)',
          relativeStart: 0.8, // Late in design phase
          relativeEnd: 1.0,  // The end of design is often tooling start
          order: 2,
        },
      ],
    },
    {
      name: 'EVT (Engineering Validation)',
      description: 'Testing functionality with production-intent components',
      relativeStart: 0.35,
      relativeEnd: 0.55,
      order: 2,
      tasks: [
        {
          name: 'EVT Build (Factory)',
          description: 'First build at contract manufacturer (~50 units)',
          relativeStart: 0.0,
          relativeEnd: 0.3,
          order: 0,
        },
        {
          name: 'Board Bring-up',
          description: 'First boot and electrical validation',
          relativeStart: 0.2,
          relativeEnd: 0.5,
          order: 1,
        },
        {
          name: 'Functional Testing',
          description: 'Verifying all features work as expected',
          relativeStart: 0.3,
          relativeEnd: 0.9,
          order: 2,
        },
      ],
    },
    {
      name: 'DVT (Design Validation)',
      description: 'Validating reliability and mass production readiness',
      relativeStart: 0.55,
      relativeEnd: 0.75,
      order: 3,
      tasks: [
        {
          name: 'DVT Build',
          description: 'Build with hard tools and final materials (~200 units)',
          relativeStart: 0.0,
          relativeEnd: 0.25,
          order: 0,
        },
        {
          name: 'Reliability Testing',
          description: 'Drop, tumble, temp/humidity, and life testing',
          relativeStart: 0.2,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Regulatory Certification',
          description: 'CE/FCC/UL testing and submissions',
          relativeStart: 0.3,
          relativeEnd: 0.9,
          order: 2,
        },
      ],
    },
    {
      name: 'PVT (Production Validation)',
      description: 'Validating the assembly line and manufacturing process',
      relativeStart: 0.75,
      relativeEnd: 0.90,
      order: 4,
      tasks: [
        {
          name: 'PVT Build',
          description: 'Pilot run to qualify the line (~1k units)',
          relativeStart: 0.0,
          relativeEnd: 0.4,
          order: 0,
        },
        {
          name: 'Process Qualification',
          description: 'CPK/Yield analysis and SOP finalization',
          relativeStart: 0.3,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'QC Mastery',
          description: 'Finalizing quality control limits and fixtures',
          relativeStart: 0.5,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Ramp',
      description: 'Scaling to volume production',
      relativeStart: 0.90,
      relativeEnd: 1.0,
      order: 5,
      tasks: [
        {
          name: 'Mass Production Start',
          description: 'Green light for volume manufacturing',
          relativeStart: 0.0,
          relativeEnd: 0.3,
          order: 0,
        },
        {
          name: 'Yield Improvements',
          description: 'Ongoing work to reduce scrap and improve efficiency',
          relativeStart: 0.2,
          relativeEnd: 1.0,
          order: 1,
        },
      ],
    },
  ],
  milestones: [
    {
      name: 'Tooling Kickoff',
      description: 'Release of funds for hard tooling (Critical Path)',
      relativePosition: 0.40,
      order: 0,
    },
    {
      name: 'EVT Exit',
      description: 'Functionality validated, ready for DVT',
      relativePosition: 0.55,
      order: 1,
    },
    {
      name: 'DVT Exit',
      description: 'Reliability & Certs passed, ready for PVT',
      relativePosition: 0.75,
      order: 2,
    },
    {
      name: 'MP Release',
      description: 'Authorized for Mass Production',
      relativePosition: 0.90,
      order: 3,
    },
  ],
};
