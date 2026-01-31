import type { Section, Phase, Milestone } from '../types';
import { getTeamColor } from '../constants/colors';

interface TemplateElement {
  readonly name: string;
  readonly description: string;
  readonly relativeStart: number;
  readonly relativeEnd: number;
  readonly order: number;
}

interface TemplatePhase {
  readonly name: string;
  readonly description: string;
  readonly relativeStart: number;
  readonly relativeEnd: number;
  readonly order: number;
  readonly elements: readonly TemplateElement[];
}

interface TemplateMilestone {
  readonly name: string;
  readonly description: string;
  readonly relativePosition: number;
  readonly order: number;
}

export interface TeamTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: 'cog' | 'megaphone' | 'code' | 'clipboard' | 'blank';
  readonly phases: readonly TemplatePhase[];
  readonly milestones: readonly TemplateMilestone[];
}

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

export const TEAM_TEMPLATES: readonly TeamTemplate[] = [
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'Hardware engineering with CAD, prototyping, and validation phases',
    icon: 'cog',
    phases: [
      {
        name: 'Requirements & Specs',
        description: 'Define technical requirements and system architecture',
        relativeStart: 0.0,
        relativeEnd: 0.15,
        order: 0,
        elements: [
          {
            name: 'Technical Requirements',
            description: 'Document technical specifications and constraints',
            relativeStart: 0.0,
            relativeEnd: 0.6,
            order: 0,
          },
          {
            name: 'Architecture Planning',
            description: 'Define system architecture and component interfaces',
            relativeStart: 0.5,
            relativeEnd: 1.0,
            order: 1,
          },
        ],
      },
      {
        name: 'Design & CAD',
        description: 'Detailed CAD modeling and simulation',
        relativeStart: 0.15,
        relativeEnd: 0.4,
        order: 1,
        elements: [
          {
            name: 'CAD Modeling',
            description: '3D modeling and detailed design',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'FEA/Simulation',
            description: 'Finite element analysis and performance simulation',
            relativeStart: 0.4,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Design Review',
            description: 'Formal design review and approval',
            relativeStart: 0.8,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Prototyping & DFM',
        description: 'Prototype build and design for manufacturing',
        relativeStart: 0.4,
        relativeEnd: 0.65,
        order: 2,
        elements: [
          {
            name: 'Prototype Build',
            description: 'Build functional prototypes',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'DFM Analysis',
            description: 'Design for manufacturing review',
            relativeStart: 0.3,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Prototype Testing',
            description: 'Functional prototype validation',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Validation & Testing',
        description: 'DVT, PVT, and certification testing',
        relativeStart: 0.65,
        relativeEnd: 0.85,
        order: 3,
        elements: [
          {
            name: 'DVT',
            description: 'Design validation testing',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'PVT',
            description: 'Production validation testing',
            relativeStart: 0.4,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Certification',
            description: 'Regulatory certification testing',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Production Release',
        description: 'Tooling and mass production release',
        relativeStart: 0.85,
        relativeEnd: 1.0,
        order: 4,
        elements: [
          {
            name: 'Tooling Release',
            description: 'Production tooling sign-off',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'MP Release',
            description: 'Mass production release',
            relativeStart: 0.5,
            relativeEnd: 1.0,
            order: 1,
          },
        ],
      },
    ],
    milestones: [
      {
        name: 'Design Lock',
        description: 'Design freeze for prototyping',
        relativePosition: 0.4,
        order: 0,
      },
      {
        name: 'DVT Complete',
        description: 'Design validation complete',
        relativePosition: 0.75,
        order: 1,
      },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Market analysis, branding, and launch campaign phases',
    icon: 'megaphone',
    phases: [
      {
        name: 'Market Analysis',
        description: 'Market research and competitive analysis',
        relativeStart: 0.0,
        relativeEnd: 0.2,
        order: 0,
        elements: [
          {
            name: 'Market Research',
            description: 'Primary and secondary market research',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Competitive Landscape',
            description: 'Competitive analysis and positioning',
            relativeStart: 0.3,
            relativeEnd: 0.75,
            order: 1,
          },
          {
            name: 'Positioning',
            description: 'Product positioning strategy',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Brand & Messaging',
        description: 'Brand strategy and messaging framework',
        relativeStart: 0.2,
        relativeEnd: 0.45,
        order: 1,
        elements: [
          {
            name: 'Brand Strategy',
            description: 'Brand positioning and identity',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Messaging Framework',
            description: 'Key messages and value propositions',
            relativeStart: 0.3,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Visual Assets',
            description: 'Marketing visual development',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Campaign Development',
        description: 'Campaign planning and content creation',
        relativeStart: 0.45,
        relativeEnd: 0.75,
        order: 2,
        elements: [
          {
            name: 'Campaign Planning',
            description: 'Marketing campaign strategy',
            relativeStart: 0.0,
            relativeEnd: 0.35,
            order: 0,
          },
          {
            name: 'Content Creation',
            description: 'Marketing content development',
            relativeStart: 0.25,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Channel Strategy',
            description: 'Channel selection and planning',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Launch Preparation',
        description: 'PR, media, and launch events',
        relativeStart: 0.75,
        relativeEnd: 0.9,
        order: 3,
        elements: [
          {
            name: 'PR & Media',
            description: 'Press relations and media outreach',
            relativeStart: 0.0,
            relativeEnd: 0.6,
            order: 0,
          },
          {
            name: 'Launch Events',
            description: 'Launch event planning and execution',
            relativeStart: 0.4,
            relativeEnd: 1.0,
            order: 1,
          },
        ],
      },
      {
        name: 'Launch & Post-Launch',
        description: 'Launch execution and performance tracking',
        relativeStart: 0.9,
        relativeEnd: 1.0,
        order: 4,
        elements: [
          {
            name: 'Launch Execution',
            description: 'Marketing launch activities',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Performance Tracking',
            description: 'Campaign performance analysis',
            relativeStart: 0.3,
            relativeEnd: 1.0,
            order: 1,
          },
        ],
      },
    ],
    milestones: [
      {
        name: 'Messaging Approved',
        description: 'Final messaging approval',
        relativePosition: 0.45,
        order: 0,
      },
      {
        name: 'Launch',
        description: 'Product launch date',
        relativePosition: 0.9,
        order: 1,
      },
    ],
  },
  {
    id: 'software',
    name: 'Software',
    description: 'Software development with sprints, testing, and release phases',
    icon: 'code',
    phases: [
      {
        name: 'Planning & Architecture',
        description: 'Requirements and technical architecture',
        relativeStart: 0.0,
        relativeEnd: 0.15,
        order: 0,
        elements: [
          {
            name: 'Product Requirements',
            description: 'Product requirements documentation',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Technical Architecture',
            description: 'System architecture design',
            relativeStart: 0.3,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Sprint Planning',
            description: 'Initial sprint planning',
            relativeStart: 0.7,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Core Development',
        description: 'Backend and frontend development',
        relativeStart: 0.15,
        relativeEnd: 0.5,
        order: 1,
        elements: [
          {
            name: 'Backend Development',
            description: 'Server and API development',
            relativeStart: 0.0,
            relativeEnd: 0.6,
            order: 0,
          },
          {
            name: 'Frontend Development',
            description: 'UI and client development',
            relativeStart: 0.2,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Integration',
            description: 'System integration',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Feature Complete',
        description: 'Feature freeze and bug fixes',
        relativeStart: 0.5,
        relativeEnd: 0.7,
        order: 2,
        elements: [
          {
            name: 'Feature Freeze',
            description: 'No new features, stabilization only',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Bug Fixes',
            description: 'Bug fixing and polish',
            relativeStart: 0.3,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Code Review',
            description: 'Final code review',
            relativeStart: 0.7,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Testing & QA',
        description: 'QA testing and user acceptance',
        relativeStart: 0.7,
        relativeEnd: 0.9,
        order: 3,
        elements: [
          {
            name: 'QA Testing',
            description: 'Quality assurance testing',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Performance Testing',
            description: 'Performance and load testing',
            relativeStart: 0.3,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'UAT',
            description: 'User acceptance testing',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Release',
        description: 'Deployment and monitoring',
        relativeStart: 0.9,
        relativeEnd: 1.0,
        order: 4,
        elements: [
          {
            name: 'Staging Deploy',
            description: 'Deploy to staging environment',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Production Deploy',
            description: 'Production deployment',
            relativeStart: 0.3,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Monitoring',
            description: 'Post-release monitoring',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
    ],
    milestones: [
      {
        name: 'Alpha',
        description: 'Alpha release',
        relativePosition: 0.5,
        order: 0,
      },
      {
        name: 'Beta',
        description: 'Beta release',
        relativePosition: 0.7,
        order: 1,
      },
      {
        name: 'GA',
        description: 'General availability',
        relativePosition: 0.95,
        order: 2,
      },
    ],
  },
  {
    id: 'pdp',
    name: 'PDP',
    description: 'Product Development Process with stage gates',
    icon: 'clipboard',
    phases: [
      {
        name: 'Ideation',
        description: 'Opportunity assessment and business case',
        relativeStart: 0.0,
        relativeEnd: 0.15,
        order: 0,
        elements: [
          {
            name: 'Opportunity Assessment',
            description: 'Market opportunity evaluation',
            relativeStart: 0.0,
            relativeEnd: 0.6,
            order: 0,
          },
          {
            name: 'Business Case',
            description: 'Initial business case development',
            relativeStart: 0.4,
            relativeEnd: 1.0,
            order: 1,
          },
        ],
      },
      {
        name: 'Feasibility',
        description: 'Technical and commercial feasibility',
        relativeStart: 0.15,
        relativeEnd: 0.3,
        order: 1,
        elements: [
          {
            name: 'Technical Feasibility',
            description: 'Technical feasibility study',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Commercial Feasibility',
            description: 'Commercial viability assessment',
            relativeStart: 0.3,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Go/No-Go',
            description: 'Go/No-Go decision preparation',
            relativeStart: 0.7,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Development',
        description: 'Design and engineering development',
        relativeStart: 0.3,
        relativeEnd: 0.6,
        order: 2,
        elements: [
          {
            name: 'Design Development',
            description: 'Product design development',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Engineering Development',
            description: 'Engineering and prototyping',
            relativeStart: 0.3,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Supply Chain Setup',
            description: 'Supply chain preparation',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Validation',
        description: 'Product and process validation',
        relativeStart: 0.6,
        relativeEnd: 0.8,
        order: 3,
        elements: [
          {
            name: 'Product Validation',
            description: 'Product testing and validation',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Process Validation',
            description: 'Manufacturing process validation',
            relativeStart: 0.3,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Regulatory Approval',
            description: 'Regulatory submissions and approval',
            relativeStart: 0.5,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Launch',
        description: 'Production ramp and market launch',
        relativeStart: 0.8,
        relativeEnd: 1.0,
        order: 4,
        elements: [
          {
            name: 'Production Ramp',
            description: 'Production ramp-up',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Market Launch',
            description: 'Product market launch',
            relativeStart: 0.3,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Post-Launch Review',
            description: 'Post-launch performance review',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
    ],
    milestones: [
      {
        name: 'Gate 1',
        description: 'Feasibility gate',
        relativePosition: 0.3,
        order: 0,
      },
      {
        name: 'Gate 2',
        description: 'Development gate',
        relativePosition: 0.6,
        order: 1,
      },
      {
        name: 'Gate 3',
        description: 'Launch gate',
        relativePosition: 0.8,
        order: 2,
      },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start with an empty team',
    icon: 'blank',
    phases: [],
    milestones: [],
  },
];

export function createSectionFromTemplate(
  template: TeamTemplate,
  teamIndex: number
): Section {
  const sectionId = generateId();

  const phases: Phase[] = template.phases.map((phaseTemplate) => {
    const phaseId = generateId();

    const elements = phaseTemplate.elements.map((element) => ({
      id: generateId(),
      phaseId,
      name: element.name,
      description: element.description,
      relativeStart: element.relativeStart,
      relativeEnd: element.relativeEnd,
      order: element.order,
    }));

    return {
      id: phaseId,
      sectionId,
      name: phaseTemplate.name,
      description: phaseTemplate.description,
      color: null, // Teams inherit color from section
      order: phaseTemplate.order,
      isCollapsed: false,
      elements,
      relativeStart: phaseTemplate.relativeStart,
      relativeEnd: phaseTemplate.relativeEnd,
    };
  });

  const milestones: Milestone[] = template.milestones.map((milestoneTemplate) => ({
    id: generateId(),
    sectionId,
    name: milestoneTemplate.name,
    description: milestoneTemplate.description,
    relativePosition: milestoneTemplate.relativePosition,
    order: milestoneTemplate.order,
  }));

  return {
    id: sectionId,
    type: 'team',
    name: template.name,
    color: getTeamColor(teamIndex),
    order: teamIndex + 1, // ID timeline is order 0
    isCollapsed: false,
    phases,
    milestones,
  };
}
