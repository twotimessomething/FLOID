/**
 * Marketing template aligned to PDP gates.
 *
 * Alignment:
 * - Market & Consumer Insights: 0.0 - 0.25 (Feeds into PRD)
 * - Brand & Positioning: 0.20 - 0.45 (Defining the story)
 * - Asset Production: 0.50 - 0.80 (Waiting for Design Freeze/EVT/DVT units)
 * - Channel Activation: 0.75 - 0.90 (Pre-orders, influencers)
 * - Launch & Sustain: 0.90 - 1.0
 */

import type { ScheduleTemplate } from '../types';

export const marketingAlignedTemplate: ScheduleTemplate = {
  id: 'marketing-aligned',
  name: 'Marketing / GTM',
  description: 'Go-to-market cycle aligned with product availability milestones',
  icon: 'megaphone',
  category: 'team',
  defaultColor: '#EC4899', // Pink
  phases: [
    {
      name: 'Insights & Strategy',
      description: 'Understanding the market landscape to inform the product',
      relativeStart: 0.0,
      relativeEnd: 0.25,
      order: 0,
      tasks: [
        {
          name: 'Market Opportunity',
          description: 'TAM/SAM/SOM and trend analysis',
          relativeStart: 0.0,
          relativeEnd: 0.4,
          order: 0,
        },
        {
          name: 'Consumer Segmentation',
          description: 'Defining who is actually going to buy this',
          relativeStart: 0.3,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Pricing Strategy (Initial)',
          description: 'Rough pricing tiers to inform engineering COGS targets',
          relativeStart: 0.6,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Brand & Positioning',
      description: 'Defining the story and visual identity',
      relativeStart: 0.20,
      relativeEnd: 0.45,
      order: 1,
      tasks: [
        {
          name: 'Naming & Identity',
          description: 'Product name, logo lockups, and trademark search',
          relativeStart: 0.0,
          relativeEnd: 0.5,
          order: 0,
        },
        {
          name: 'Value Proposition',
          description: 'Defining the "Why Us" and key differentiators',
          relativeStart: 0.3,
          relativeEnd: 0.8,
          order: 1,
        },
        {
          name: 'Creative Brief',
          description: 'Briefing agencies for asset production runs',
          relativeStart: 0.7,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Asset Production',
      description: 'Creating the content (photos/video/web) - Needs HW Prototypes',
      relativeStart: 0.50,
      relativeEnd: 0.80,
      order: 2,
      tasks: [
        {
          name: 'CGI & Renders',
          description: 'Using CAD for early marketing visuals (pre-hardware)',
          relativeStart: 0.0,
          relativeEnd: 0.4,
          order: 0,
        },
        {
          name: 'Photo/Video Shoot',
          description: 'On-location shoot using looks-like/works-like models',
          relativeStart: 0.3, // Needs high-fidelity prototypes (late EVT/early DVT)
          relativeEnd: 0.7,
          order: 1,
        },
        {
          name: 'Web Development',
          description: 'Building the landing pages and e-commerce flow',
          relativeStart: 0.5,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Channel Activation',
      description: 'Warming up the sales channels',
      relativeStart: 0.75,
      relativeEnd: 0.90,
      order: 3,
      tasks: [
        {
          name: 'Retail Sell-in',
          description: 'Pitching to distributors and retail buyers',
          relativeStart: 0.0,
          relativeEnd: 0.5,
          order: 0,
        },
        {
          name: 'Influencer Seeding',
          description: 'Sending units to reviewers under embargo',
          relativeStart: 0.4,
          relativeEnd: 0.9,
          order: 1,
        },
        {
          name: 'Pre-order Campaign',
          description: 'Early access sales to build momentum',
          relativeStart: 0.6,
          relativeEnd: 1.0,
          order: 2,
        },
      ],
    },
    {
      name: 'Launch',
      description: 'The big day and immediate aftermath',
      relativeStart: 0.90,
      relativeEnd: 1.0,
      order: 4,
      tasks: [
        {
          name: 'Global Launch',
          description: 'Embargo lift, site live, press release drop',
          relativeStart: 0.0,
          relativeEnd: 0.1, // Point in time
          order: 0,
        },
        {
          name: 'Paid Media Blitz',
          description: 'High-spend ad acquisition period',
          relativeStart: 0.1,
          relativeEnd: 0.8,
          order: 1,
        },
      ],
    },
  ],
  milestones: [
    {
      name: 'Positioning Lock',
      description: 'Signed off on messaging framework',
      relativePosition: 0.45,
      order: 0,
    },
    {
      name: 'Assets Complete',
      description: 'All photography and web assets ready',
      relativePosition: 0.80,
      order: 1,
    },
    {
      name: 'Embargo Lift',
      description: 'Reviews go live',
      relativePosition: 0.90,
      order: 2,
    },
    {
      name: 'General Availability',
      description: 'Product shipping to customers',
      relativePosition: 0.95,
      order: 3,
    },
  ],
};
