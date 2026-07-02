/**
 * Industrial Design template aligned to PDP gates.
 *
 * Alignment:
 * - Discovery: 0.0 - 0.15 (Starts early, overlaps with Gate 0/1)
 * - Conceptualization: 0.10 - 0.25 (Intensive creative burst)
 * - Refinement & CAD: 0.20 - 0.40 (The heavy lifting, leading to Design Freeze)
 * - Engineering Support: 0.35 - 0.70 (Long tail support during tooling/builds)
 * - CMF & Pre-Production: 0.60 - 0.90 (Final polish, packaging, texture matching)
 * - Launch Support: 0.85 - 1.0
 */

import { PHASE_COLORS } from '../../../constants/colors';
import type { ScheduleTemplate } from '../types';

export const industrialDesignAlignedTemplate: ScheduleTemplate = {
  id: 'id-timeline-aligned',
  name: 'Industrial Design',
  description: 'Realistic ID process with early intensity and long-tail support',
  icon: 'palette',
  category: 'core',
  defaultColor: '#6366F1', // Indigo
  phases: [
    {
      name: 'Discovery & Immersion',
      description: 'Understanding the problem space, users, and market context',
      color: PHASE_COLORS.discovery,
      order: 0,
      relativeStart: 0.0,
      relativeEnd: 0.15,
      tasks: [
        {
          name: 'Stakeholder Interviews',
          description: 'Aligning on business goals and brand vision',
          relativeStart: 0.0,
          relativeEnd: 0.3, // Very early
          order: 0,
        },
        {
          name: 'User & Market Research',
          description: 'Ethnographic research, trend analysis, and competitive tear-downs',
          relativeStart: 0.1,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Opportunity Mapping',
          description: 'Synthesizing insights into design opportunities',
          relativeStart: 0.6,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Concept Generation',
      description: 'Broad exploration of form, function, and interaction',
      color: PHASE_COLORS.concept,
      order: 1,
      relativeStart: 0.10, // Overlaps with tail of discovery
      relativeEnd: 0.25,
      tasks: [
        {
          name: 'Blue Sky Sketching',
          description: 'Rapid divergent ideation',
          relativeStart: 0.0,
          relativeEnd: 0.4,
          order: 0,
        },
        {
          name: 'Form Studies',
          description: 'Low-fidelity mockups (foam, paper) to test ergonomics and size',
          relativeStart: 0.3,
          relativeEnd: 0.7,
          order: 1,
        },
        {
          name: 'Concept Convergence',
          description: 'Down-selecting to 2-3 primary directions',
          relativeStart: 0.6,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Design Refinement',
      description: 'Developing the chosen direction into a manufacturable product',
      color: PHASE_COLORS.design,
      order: 2,
      relativeStart: 0.20, // Overlaps with previous phase significantly
      relativeEnd: 0.40,  // Ends around Gate 2/3 transition
      tasks: [
        {
          name: 'Surface Modeling (A-Class)',
          description: 'High quality CAS/CAD modeling',
          relativeStart: 0.0,
          relativeEnd: 0.6,
          order: 0,
        },
        {
          name: 'CMF Exploration',
          description: 'Initial material and finish definition',
          relativeStart: 0.3,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Visual Prototypes',
          description: 'High-fidelity cosmetic models for executive sign-off',
          relativeStart: 0.5,
          relativeEnd: 0.9,
          order: 2,
        },
        {
          name: 'Design Freeze',
          description: 'Master CAD handover to Engineering',
          relativeStart: 0.9,
          relativeEnd: 1.0,
          order: 3,
        },
      ],
    },
    {
      name: 'Engineering Support',
      description: 'Maintaining design intent during ME/EE development',
      color: PHASE_COLORS.engineering,
      order: 3,
      relativeStart: 0.35, // Starts before refinement ends
      relativeEnd: 0.70,
      tasks: [
        {
          name: 'ME Collaboration',
          description: 'Resolving interference and manufacturing constraints',
          relativeStart: 0.0,
          relativeEnd: 0.5,
          order: 0,
        },
        {
          name: 'Tooling Review',
          description: 'Reviewing mold flow and parting lines',
          relativeStart: 0.4,
          relativeEnd: 0.7,
          order: 1,
        },
        {
          name: 'EVT Review',
          description: 'Reviewing first engineering builds for cosmetic defects',
          relativeStart: 0.6,
          relativeEnd: 0.9,
          order: 2,
        },
      ],
    },
    {
      name: 'Production Finalization',
      description: 'Finalizing CMF and packaging for mass production',
      color: PHASE_COLORS.production,
      order: 4,
      relativeStart: 0.60,
      relativeEnd: 0.90,
      tasks: [
        {
          name: 'CMF Control Documents',
          description: 'Finalizing mastering of color chips and texture plaques',
          relativeStart: 0.0,
          relativeEnd: 0.4,
          order: 0,
        },
        {
          name: 'Packaging Design',
          description: 'Structural and graphic design for out-of-box experience',
          relativeStart: 0.2,
          relativeEnd: 0.7,
          order: 1,
        },
        {
          name: 'Golden Sample Sign-off',
          description: 'Approving the perfect master sample for production QC',
          relativeStart: 0.8,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Launch Assets',
      description: 'Supporting marketing with product visuals',
      color: '#10B981',
      order: 5,
      relativeStart: 0.85,
      relativeEnd: 1.0,
      tasks: [
        {
          name: 'Product Photography',
          description: 'Directing shoots using final production units',
          relativeStart: 0.0,
          relativeEnd: 0.6,
          order: 0,
        },
        {
          name: 'Design Story',
          description: 'Creating assets that explain the design philosophy',
          relativeStart: 0.4,
          relativeEnd: 1.0,
          order: 1,
        },
      ],
    },
  ],
  milestones: [
    {
      name: 'Concept Down-select',
      description: 'Selection of primary design direction',
      relativePosition: 0.25,
      order: 0,
    },
    {
      name: 'Design Freeze',
      description: 'Turnover of A-Surface to Engineering',
      relativePosition: 0.40,
      order: 1,
    },
    {
      name: 'Packaging Release',
      description: 'Artwork release to print vendors',
      relativePosition: 0.80,
      order: 2,
    },
    {
      name: 'Golden Master',
      description: 'Final cosmetic approval boundary QA',
      relativePosition: 0.90,
      order: 3,
    },
  ],
};
