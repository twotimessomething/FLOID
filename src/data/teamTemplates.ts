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
    description: 'Hardware engineering with EVT/DVT/PVT validation phases',
    icon: 'cog',
    phases: [
      {
        name: 'Requirements & Architecture',
        description: 'Define technical requirements, system architecture, and component specifications',
        relativeStart: 0.0,
        relativeEnd: 0.12,
        order: 0,
        elements: [
          {
            name: 'Technical Requirements',
            description: 'Document PRD specifications, performance targets, and constraints',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'System Architecture',
            description: 'Define system architecture, component interfaces, and BOM structure',
            relativeStart: 0.3,
            relativeEnd: 0.85,
            order: 1,
          },
          {
            name: 'Feasibility Review',
            description: 'Technical feasibility assessment and risk identification',
            relativeStart: 0.7,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Design & CAD',
        description: 'Detailed CAD modeling, simulation, and POC development',
        relativeStart: 0.12,
        relativeEnd: 0.28,
        order: 1,
        elements: [
          {
            name: 'CAD Modeling',
            description: '3D modeling, detailed design, and component selection',
            relativeStart: 0.0,
            relativeEnd: 0.55,
            order: 0,
          },
          {
            name: 'FEA/Thermal Analysis',
            description: 'Finite element analysis, thermal simulation, and performance modeling',
            relativeStart: 0.35,
            relativeEnd: 0.75,
            order: 1,
          },
          {
            name: 'POC Build',
            description: 'Proof of concept prototype to validate core functionality',
            relativeStart: 0.6,
            relativeEnd: 0.9,
            order: 2,
          },
          {
            name: 'Design Review',
            description: 'Formal design review and approval for EVT entry',
            relativeStart: 0.85,
            relativeEnd: 1.0,
            order: 3,
          },
        ],
      },
      {
        name: 'EVT',
        description: 'Engineering Validation Testing - first functional prototypes (20-50 units)',
        relativeStart: 0.28,
        relativeEnd: 0.45,
        order: 2,
        elements: [
          {
            name: 'EVT Build',
            description: 'Build first engineering prototypes with production-intent components',
            relativeStart: 0.0,
            relativeEnd: 0.35,
            order: 0,
          },
          {
            name: 'Functional Testing',
            description: 'Validate all functional requirements against PRD specifications',
            relativeStart: 0.25,
            relativeEnd: 0.65,
            order: 1,
          },
          {
            name: 'DFM Analysis',
            description: 'Design for manufacturing review and tooling planning',
            relativeStart: 0.5,
            relativeEnd: 0.85,
            order: 2,
          },
          {
            name: 'EVT Exit Review',
            description: 'Gate review for EVT completion and DVT readiness',
            relativeStart: 0.8,
            relativeEnd: 1.0,
            order: 3,
          },
        ],
      },
      {
        name: 'DVT',
        description: 'Design Validation Testing - refined design with user testing (50-200 units)',
        relativeStart: 0.45,
        relativeEnd: 0.65,
        order: 3,
        elements: [
          {
            name: 'DVT Build',
            description: 'Build design validation units with soft tooling',
            relativeStart: 0.0,
            relativeEnd: 0.3,
            order: 0,
          },
          {
            name: 'Reliability Testing',
            description: 'Environmental stress testing, drop tests, and lifecycle validation',
            relativeStart: 0.2,
            relativeEnd: 0.6,
            order: 1,
          },
          {
            name: 'Regulatory Submission',
            description: 'FCC, UL, CE certification submissions and pre-compliance testing',
            relativeStart: 0.4,
            relativeEnd: 0.85,
            order: 2,
          },
          {
            name: 'Hard Tooling Kickoff',
            description: 'Commission production tooling (12+ week lead time)',
            relativeStart: 0.3,
            relativeEnd: 0.5,
            order: 3,
          },
          {
            name: 'DVT Exit Review',
            description: 'Gate review for DVT completion and PVT readiness',
            relativeStart: 0.85,
            relativeEnd: 1.0,
            order: 4,
          },
        ],
      },
      {
        name: 'PVT',
        description: 'Production Validation Testing - production line validation (300-2000 units)',
        relativeStart: 0.65,
        relativeEnd: 0.85,
        order: 4,
        elements: [
          {
            name: 'PVT Build',
            description: 'First production run on final tooling and assembly line',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Yield Optimization',
            description: 'Production yield analysis and process optimization',
            relativeStart: 0.25,
            relativeEnd: 0.65,
            order: 1,
          },
          {
            name: 'Quality Validation',
            description: 'Statistical process control and quality metrics validation',
            relativeStart: 0.5,
            relativeEnd: 0.85,
            order: 2,
          },
          {
            name: 'Regulatory Approval',
            description: 'Final certification approvals and compliance documentation',
            relativeStart: 0.6,
            relativeEnd: 0.95,
            order: 3,
          },
          {
            name: 'PVT Exit Review',
            description: 'Gate review for MP release authorization',
            relativeStart: 0.9,
            relativeEnd: 1.0,
            order: 4,
          },
        ],
      },
      {
        name: 'MP Ramp',
        description: 'Mass Production ramp-up and sustained manufacturing',
        relativeStart: 0.85,
        relativeEnd: 1.0,
        order: 5,
        elements: [
          {
            name: 'Initial Production',
            description: 'First mass production lots with progressive volume increase',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Line Rate Validation',
            description: 'Validate production line achieves target throughput and quality',
            relativeStart: 0.3,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Sustaining Handoff',
            description: 'Transition to sustaining engineering team for ongoing support',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
    ],
    milestones: [
      {
        name: 'Design Freeze',
        description: 'Design locked for EVT prototyping',
        relativePosition: 0.28,
        order: 0,
      },
      {
        name: 'EVT Exit',
        description: 'Engineering validation complete, ready for DVT',
        relativePosition: 0.45,
        order: 1,
      },
      {
        name: 'DVT Exit',
        description: 'Design validation complete, ready for PVT',
        relativePosition: 0.65,
        order: 2,
      },
      {
        name: 'MP Release',
        description: 'Authorized for mass production',
        relativePosition: 0.85,
        order: 3,
      },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Go-to-market strategy with research, positioning, and launch campaign phases',
    icon: 'megaphone',
    phases: [
      {
        name: 'Market Research & Strategy',
        description: 'Market analysis, competitive landscape, and target audience definition',
        relativeStart: 0.0,
        relativeEnd: 0.18,
        order: 0,
        elements: [
          {
            name: 'Market Sizing',
            description: 'TAM/SAM/SOM analysis and market opportunity assessment',
            relativeStart: 0.0,
            relativeEnd: 0.45,
            order: 0,
          },
          {
            name: 'Competitive Analysis',
            description: 'Competitor positioning, pricing, and feature comparison',
            relativeStart: 0.25,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Audience Research',
            description: 'Target persona development and customer journey mapping',
            relativeStart: 0.5,
            relativeEnd: 0.9,
            order: 2,
          },
          {
            name: 'GTM Strategy',
            description: 'Go-to-market strategy framework and channel selection',
            relativeStart: 0.75,
            relativeEnd: 1.0,
            order: 3,
          },
        ],
      },
      {
        name: 'Positioning & Messaging',
        description: 'Brand positioning, messaging framework, and value proposition',
        relativeStart: 0.18,
        relativeEnd: 0.38,
        order: 1,
        elements: [
          {
            name: 'Positioning Development',
            description: 'Product positioning statement and differentiation strategy',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Messaging Framework',
            description: 'Key messages, taglines, and value propositions by audience',
            relativeStart: 0.25,
            relativeEnd: 0.65,
            order: 1,
          },
          {
            name: 'Pricing Strategy',
            description: 'Pricing model, tiers, and competitive positioning',
            relativeStart: 0.45,
            relativeEnd: 0.8,
            order: 2,
          },
          {
            name: 'Messaging Validation',
            description: 'Customer testing and refinement of messaging',
            relativeStart: 0.7,
            relativeEnd: 1.0,
            order: 3,
          },
        ],
      },
      {
        name: 'Content & Creative',
        description: 'Campaign content creation and creative asset development',
        relativeStart: 0.38,
        relativeEnd: 0.65,
        order: 2,
        elements: [
          {
            name: 'Creative Brief',
            description: 'Campaign creative direction and brand guidelines',
            relativeStart: 0.0,
            relativeEnd: 0.25,
            order: 0,
          },
          {
            name: 'Visual Assets',
            description: 'Photography, video, and graphic design production',
            relativeStart: 0.15,
            relativeEnd: 0.6,
            order: 1,
          },
          {
            name: 'Website & Landing Pages',
            description: 'Product pages, landing pages, and conversion optimization',
            relativeStart: 0.35,
            relativeEnd: 0.75,
            order: 2,
          },
          {
            name: 'Sales Enablement',
            description: 'Sales decks, one-pagers, and demo materials',
            relativeStart: 0.5,
            relativeEnd: 0.85,
            order: 3,
          },
          {
            name: 'Content Calendar',
            description: 'Blog posts, social content, and email sequences',
            relativeStart: 0.65,
            relativeEnd: 1.0,
            order: 4,
          },
        ],
      },
      {
        name: 'Pre-Launch',
        description: 'Launch preparation, PR outreach, and campaign setup',
        relativeStart: 0.65,
        relativeEnd: 0.85,
        order: 3,
        elements: [
          {
            name: 'PR & Media Outreach',
            description: 'Press releases, media kits, and journalist briefings',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Influencer & Analyst',
            description: 'Influencer partnerships and analyst briefings',
            relativeStart: 0.2,
            relativeEnd: 0.65,
            order: 1,
          },
          {
            name: 'Campaign Setup',
            description: 'Ad platforms, tracking pixels, and UTM configuration',
            relativeStart: 0.4,
            relativeEnd: 0.8,
            order: 2,
          },
          {
            name: 'Launch Rehearsal',
            description: 'Final QA, asset verification, and team alignment',
            relativeStart: 0.7,
            relativeEnd: 1.0,
            order: 3,
          },
        ],
      },
      {
        name: 'Launch Week',
        description: 'Product launch execution and real-time campaign management',
        relativeStart: 0.85,
        relativeEnd: 0.92,
        order: 4,
        elements: [
          {
            name: 'Launch Day',
            description: 'Coordinated launch across all channels',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Paid Campaign Activation',
            description: 'Launch paid media campaigns across channels',
            relativeStart: 0.2,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Real-time Optimization',
            description: 'Monitor and optimize campaign performance',
            relativeStart: 0.5,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Post-Launch',
        description: 'Performance analysis, optimization, and sustained marketing',
        relativeStart: 0.92,
        relativeEnd: 1.0,
        order: 5,
        elements: [
          {
            name: '30-Day Review',
            description: 'Campaign performance analysis and ROI reporting',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Retargeting & Nurture',
            description: 'Re-engage prospects and optimize conversion funnel',
            relativeStart: 0.3,
            relativeEnd: 0.8,
            order: 1,
          },
          {
            name: 'Learnings & Iteration',
            description: 'Document insights and plan next campaign phase',
            relativeStart: 0.6,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
    ],
    milestones: [
      {
        name: 'Strategy Approved',
        description: 'GTM strategy and positioning finalized',
        relativePosition: 0.38,
        order: 0,
      },
      {
        name: 'Assets Complete',
        description: 'All creative and content assets approved',
        relativePosition: 0.65,
        order: 1,
      },
      {
        name: 'Launch Day',
        description: 'Product launch date',
        relativePosition: 0.85,
        order: 2,
      },
      {
        name: '30-Day Review',
        description: 'Post-launch performance review',
        relativePosition: 0.98,
        order: 3,
      },
    ],
  },
  {
    id: 'software',
    name: 'Software',
    description: 'Agile software development with sprints, testing, and release phases',
    icon: 'code',
    phases: [
      {
        name: 'Discovery & Planning',
        description: 'Requirements gathering, technical architecture, and sprint 0 setup',
        relativeStart: 0.0,
        relativeEnd: 0.12,
        order: 0,
        elements: [
          {
            name: 'Requirements & User Stories',
            description: 'Product requirements, user stories, and acceptance criteria',
            relativeStart: 0.0,
            relativeEnd: 0.45,
            order: 0,
          },
          {
            name: 'Technical Architecture',
            description: 'System design, tech stack decisions, and API contracts',
            relativeStart: 0.25,
            relativeEnd: 0.75,
            order: 1,
          },
          {
            name: 'Sprint 0 Setup',
            description: 'Dev environment, CI/CD pipeline, and repo configuration',
            relativeStart: 0.55,
            relativeEnd: 0.9,
            order: 2,
          },
          {
            name: 'Backlog Grooming',
            description: 'Story estimation, prioritization, and sprint planning',
            relativeStart: 0.8,
            relativeEnd: 1.0,
            order: 3,
          },
        ],
      },
      {
        name: 'Core Development',
        description: 'Primary feature development across multiple sprints',
        relativeStart: 0.12,
        relativeEnd: 0.52,
        order: 1,
        elements: [
          {
            name: 'Backend/API Development',
            description: 'Server-side logic, database, and API implementation',
            relativeStart: 0.0,
            relativeEnd: 0.55,
            order: 0,
          },
          {
            name: 'Frontend Development',
            description: 'UI components, state management, and client logic',
            relativeStart: 0.15,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Integration & APIs',
            description: 'Third-party integrations and internal service connections',
            relativeStart: 0.4,
            relativeEnd: 0.85,
            order: 2,
          },
          {
            name: 'Unit & Integration Tests',
            description: 'Continuous testing during development sprints',
            relativeStart: 0.2,
            relativeEnd: 0.95,
            order: 3,
          },
          {
            name: 'Sprint Reviews',
            description: 'Demo sessions and stakeholder feedback',
            relativeStart: 0.85,
            relativeEnd: 1.0,
            order: 4,
          },
        ],
      },
      {
        name: 'Feature Complete',
        description: 'Alpha milestone - all features implemented, stabilization begins',
        relativeStart: 0.52,
        relativeEnd: 0.68,
        order: 2,
        elements: [
          {
            name: 'Feature Freeze',
            description: 'Lock feature scope, no new features accepted',
            relativeStart: 0.0,
            relativeEnd: 0.2,
            order: 0,
          },
          {
            name: 'Bug Fixing',
            description: 'Address P0/P1 bugs and critical issues',
            relativeStart: 0.1,
            relativeEnd: 0.65,
            order: 1,
          },
          {
            name: 'Code Quality',
            description: 'Code review, refactoring, and tech debt reduction',
            relativeStart: 0.35,
            relativeEnd: 0.75,
            order: 2,
          },
          {
            name: 'Documentation',
            description: 'API docs, README updates, and runbooks',
            relativeStart: 0.55,
            relativeEnd: 0.9,
            order: 3,
          },
          {
            name: 'Alpha Release',
            description: 'Internal alpha deployment for testing',
            relativeStart: 0.85,
            relativeEnd: 1.0,
            order: 4,
          },
        ],
      },
      {
        name: 'Beta Testing',
        description: 'External beta release with user feedback and optimization',
        relativeStart: 0.68,
        relativeEnd: 0.85,
        order: 3,
        elements: [
          {
            name: 'Beta Deployment',
            description: 'Deploy beta version to select users or public beta',
            relativeStart: 0.0,
            relativeEnd: 0.25,
            order: 0,
          },
          {
            name: 'User Feedback',
            description: 'Collect and analyze beta user feedback',
            relativeStart: 0.15,
            relativeEnd: 0.6,
            order: 1,
          },
          {
            name: 'Performance Optimization',
            description: 'Load testing, profiling, and performance tuning',
            relativeStart: 0.35,
            relativeEnd: 0.75,
            order: 2,
          },
          {
            name: 'Security Review',
            description: 'Security audit, penetration testing, and remediation',
            relativeStart: 0.5,
            relativeEnd: 0.85,
            order: 3,
          },
          {
            name: 'Beta Bug Fixes',
            description: 'Address issues discovered during beta',
            relativeStart: 0.25,
            relativeEnd: 0.95,
            order: 4,
          },
        ],
      },
      {
        name: 'Release Candidate',
        description: 'Final QA, UAT, and release preparation',
        relativeStart: 0.85,
        relativeEnd: 0.94,
        order: 4,
        elements: [
          {
            name: 'RC Build',
            description: 'Create release candidate build',
            relativeStart: 0.0,
            relativeEnd: 0.25,
            order: 0,
          },
          {
            name: 'Regression Testing',
            description: 'Full regression test suite execution',
            relativeStart: 0.15,
            relativeEnd: 0.55,
            order: 1,
          },
          {
            name: 'UAT',
            description: 'User acceptance testing with stakeholders',
            relativeStart: 0.4,
            relativeEnd: 0.8,
            order: 2,
          },
          {
            name: 'Release Prep',
            description: 'Release notes, migration scripts, and rollback plan',
            relativeStart: 0.65,
            relativeEnd: 1.0,
            order: 3,
          },
        ],
      },
      {
        name: 'GA & Monitoring',
        description: 'Production deployment and post-launch monitoring',
        relativeStart: 0.94,
        relativeEnd: 1.0,
        order: 5,
        elements: [
          {
            name: 'Production Deploy',
            description: 'Staged rollout to production environment',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Monitoring & Alerts',
            description: 'Verify monitoring, alerts, and on-call readiness',
            relativeStart: 0.25,
            relativeEnd: 0.7,
            order: 1,
          },
          {
            name: 'Hotfix Support',
            description: 'Address critical production issues',
            relativeStart: 0.5,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
    ],
    milestones: [
      {
        name: 'Architecture Complete',
        description: 'Technical design approved and sprint 0 complete',
        relativePosition: 0.12,
        order: 0,
      },
      {
        name: 'Alpha',
        description: 'All features implemented, internal testing begins',
        relativePosition: 0.52,
        order: 1,
      },
      {
        name: 'Feature Freeze',
        description: 'No new features, stabilization only',
        relativePosition: 0.55,
        order: 2,
      },
      {
        name: 'Beta',
        description: 'External beta release',
        relativePosition: 0.68,
        order: 3,
      },
      {
        name: 'RC',
        description: 'Release candidate ready for final validation',
        relativePosition: 0.85,
        order: 4,
      },
      {
        name: 'GA',
        description: 'General availability - production release',
        relativePosition: 0.94,
        order: 5,
      },
    ],
  },
  {
    id: 'pdp',
    name: 'PDP',
    description: 'Stage-Gate Product Development Process with formal decision gates',
    icon: 'clipboard',
    phases: [
      {
        name: 'Discovery',
        description: 'Ideation, opportunity identification, and initial screening',
        relativeStart: 0.0,
        relativeEnd: 0.08,
        order: 0,
        elements: [
          {
            name: 'Ideation',
            description: 'Brainstorming, trend analysis, and opportunity identification',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Idea Screening',
            description: 'Initial evaluation against strategic criteria',
            relativeStart: 0.35,
            relativeEnd: 0.85,
            order: 1,
          },
          {
            name: 'Gate 0 Prep',
            description: 'Prepare idea screen presentation for Gate 0',
            relativeStart: 0.75,
            relativeEnd: 1.0,
            order: 2,
          },
        ],
      },
      {
        name: 'Scoping',
        description: 'Preliminary market and technical assessment',
        relativeStart: 0.08,
        relativeEnd: 0.18,
        order: 1,
        elements: [
          {
            name: 'Market Assessment',
            description: 'Preliminary market research and competitive analysis',
            relativeStart: 0.0,
            relativeEnd: 0.5,
            order: 0,
          },
          {
            name: 'Technical Assessment',
            description: 'Preliminary technical feasibility and risk assessment',
            relativeStart: 0.25,
            relativeEnd: 0.75,
            order: 1,
          },
          {
            name: 'Financial Snapshot',
            description: 'Rough financial analysis and resource estimates',
            relativeStart: 0.55,
            relativeEnd: 0.9,
            order: 2,
          },
          {
            name: 'Gate 1 Prep',
            description: 'Prepare scoping deliverables for Gate 1 review',
            relativeStart: 0.8,
            relativeEnd: 1.0,
            order: 3,
          },
        ],
      },
      {
        name: 'Business Case',
        description: 'Detailed business case and project definition',
        relativeStart: 0.18,
        relativeEnd: 0.32,
        order: 2,
        elements: [
          {
            name: 'User Research',
            description: 'In-depth customer research and needs analysis',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Competitive Analysis',
            description: 'Detailed competitive landscape and differentiation strategy',
            relativeStart: 0.2,
            relativeEnd: 0.55,
            order: 1,
          },
          {
            name: 'Technical Definition',
            description: 'Product definition, architecture, and technical requirements',
            relativeStart: 0.35,
            relativeEnd: 0.7,
            order: 2,
          },
          {
            name: 'Financial Analysis',
            description: 'Detailed P&L, NPV, ROI, and payback analysis',
            relativeStart: 0.5,
            relativeEnd: 0.85,
            order: 3,
          },
          {
            name: 'Project Plan',
            description: 'Detailed project plan, resources, and timeline',
            relativeStart: 0.7,
            relativeEnd: 0.95,
            order: 4,
          },
          {
            name: 'Gate 2 Prep',
            description: 'Prepare business case for Gate 2 go/kill decision',
            relativeStart: 0.9,
            relativeEnd: 1.0,
            order: 5,
          },
        ],
      },
      {
        name: 'Development',
        description: 'Design, development, and prototyping',
        relativeStart: 0.32,
        relativeEnd: 0.6,
        order: 3,
        elements: [
          {
            name: 'Design & Engineering',
            description: 'Product design, engineering, and CAD development',
            relativeStart: 0.0,
            relativeEnd: 0.45,
            order: 0,
          },
          {
            name: 'Prototype Development',
            description: 'Functional prototype builds and iteration',
            relativeStart: 0.3,
            relativeEnd: 0.65,
            order: 1,
          },
          {
            name: 'Supply Chain Development',
            description: 'Supplier selection, tooling, and manufacturing planning',
            relativeStart: 0.45,
            relativeEnd: 0.8,
            order: 2,
          },
          {
            name: 'Marketing Plan',
            description: 'Full marketing plan and launch strategy development',
            relativeStart: 0.55,
            relativeEnd: 0.85,
            order: 3,
          },
          {
            name: 'Operations Readiness',
            description: 'Operations, logistics, and customer support planning',
            relativeStart: 0.7,
            relativeEnd: 0.95,
            order: 4,
          },
          {
            name: 'Gate 3 Prep',
            description: 'Prepare for Gate 3 testing/validation approval',
            relativeStart: 0.9,
            relativeEnd: 1.0,
            order: 5,
          },
        ],
      },
      {
        name: 'Testing & Validation',
        description: 'Product validation, process validation, and regulatory',
        relativeStart: 0.6,
        relativeEnd: 0.8,
        order: 4,
        elements: [
          {
            name: 'Product Testing',
            description: 'In-house product testing and validation',
            relativeStart: 0.0,
            relativeEnd: 0.4,
            order: 0,
          },
          {
            name: 'Customer Validation',
            description: 'Field trials, beta testing, and customer feedback',
            relativeStart: 0.2,
            relativeEnd: 0.6,
            order: 1,
          },
          {
            name: 'Process Validation',
            description: 'Manufacturing process validation and pilot production',
            relativeStart: 0.35,
            relativeEnd: 0.75,
            order: 2,
          },
          {
            name: 'Regulatory Approval',
            description: 'Regulatory submissions and certifications',
            relativeStart: 0.5,
            relativeEnd: 0.9,
            order: 3,
          },
          {
            name: 'Market Testing',
            description: 'Market test or trial sell to validate commercial assumptions',
            relativeStart: 0.6,
            relativeEnd: 0.9,
            order: 4,
          },
          {
            name: 'Gate 4 Prep',
            description: 'Prepare for Gate 4 launch decision',
            relativeStart: 0.85,
            relativeEnd: 1.0,
            order: 5,
          },
        ],
      },
      {
        name: 'Launch',
        description: 'Full production and market launch',
        relativeStart: 0.8,
        relativeEnd: 1.0,
        order: 5,
        elements: [
          {
            name: 'Production Ramp',
            description: 'Full-scale production ramp-up',
            relativeStart: 0.0,
            relativeEnd: 0.35,
            order: 0,
          },
          {
            name: 'Market Launch',
            description: 'Marketing launch and sales activation',
            relativeStart: 0.15,
            relativeEnd: 0.5,
            order: 1,
          },
          {
            name: 'Distribution Rollout',
            description: 'Channel fill and distribution expansion',
            relativeStart: 0.3,
            relativeEnd: 0.65,
            order: 2,
          },
          {
            name: 'Performance Monitoring',
            description: 'Track launch metrics and market performance',
            relativeStart: 0.45,
            relativeEnd: 0.85,
            order: 3,
          },
          {
            name: 'Post-Launch Review',
            description: 'Gate 5 review - lessons learned and project close-out',
            relativeStart: 0.75,
            relativeEnd: 1.0,
            order: 4,
          },
        ],
      },
    ],
    milestones: [
      {
        name: 'Gate 0',
        description: 'Idea Screen - initial go/kill decision',
        relativePosition: 0.08,
        order: 0,
      },
      {
        name: 'Gate 1',
        description: 'Scope Gate - approve for business case development',
        relativePosition: 0.18,
        order: 1,
      },
      {
        name: 'Gate 2',
        description: 'Go to Development - business case approved',
        relativePosition: 0.32,
        order: 2,
      },
      {
        name: 'Gate 3',
        description: 'Go to Testing - development complete',
        relativePosition: 0.6,
        order: 3,
      },
      {
        name: 'Gate 4',
        description: 'Go to Launch - validation complete',
        relativePosition: 0.8,
        order: 4,
      },
      {
        name: 'Gate 5',
        description: 'Post-Launch Review - project close-out',
        relativePosition: 0.98,
        order: 5,
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
