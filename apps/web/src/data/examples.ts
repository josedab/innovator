/**
 * Pre-computed example investigations for the landing page "Explore Examples" feature.
 * These provide instant demos without requiring LLM calls.
 */

export interface ExampleInvestigation {
  id: string;
  subject: string;
  category: string;
  icon: string;
  summary: string;
  keyHighlights: string[];
}

export const EXAMPLE_INVESTIGATIONS: ExampleInvestigation[] = [
  {
    id: "solar-energy",
    subject: "Solar Energy Innovation",
    category: "Energy",
    icon: "☀️",
    summary:
      "Solar energy continues to transform the global power landscape with breakthroughs in perovskite cells, bifacial panels, and integrated storage solutions.",
    keyHighlights: [
      "Perovskite-silicon tandem cells approaching 33% efficiency",
      "Building-integrated photovoltaics enabling net-zero architecture",
      "Grid-scale storage pairing with solar farms",
    ],
  },
  {
    id: "remote-work",
    subject: "Future of Remote Work",
    category: "Workplace",
    icon: "🏠",
    summary:
      "Remote work has evolved from pandemic necessity to strategic advantage, reshaping organizational design, talent acquisition, and urban planning.",
    keyHighlights: [
      "Async-first communication transforming meeting culture",
      "Digital nomad visas creating new talent corridors",
      "VR/AR workspaces bridging presence gaps",
    ],
  },
  {
    id: "education-tech",
    subject: "AI in Education",
    category: "Education",
    icon: "🎓",
    summary:
      "AI is personalizing education at scale, enabling adaptive learning paths, automated assessment, and democratizing access to quality instruction.",
    keyHighlights: [
      "AI tutors providing 1:1 personalized instruction",
      "Automated formative assessment with real-time feedback",
      "Content generation reducing course development costs",
    ],
  },
  {
    id: "healthcare-ai",
    subject: "Healthcare AI & Diagnostics",
    category: "Healthcare",
    icon: "🏥",
    summary:
      "AI-powered diagnostics are achieving specialist-level accuracy in radiology, pathology, and genomics, transforming preventive care delivery.",
    keyHighlights: [
      "Multi-modal AI combining imaging, genomics, and EHR data",
      "Federated learning enabling privacy-preserving model training",
      "Wearable-AI integration for continuous health monitoring",
    ],
  },
  {
    id: "sustainable-packaging",
    subject: "Sustainable Packaging Solutions",
    category: "Sustainability",
    icon: "♻️",
    summary:
      "Sustainable packaging is moving beyond recycling to include edible packaging, mycelium-based materials, and closed-loop reuse systems.",
    keyHighlights: [
      "Seaweed-based films replacing single-use plastics",
      "Digital watermarks enabling automated sorting",
      "Reusable packaging-as-a-service business models",
    ],
  },
  {
    id: "urban-mobility",
    subject: "Urban Mobility & Transportation",
    category: "Infrastructure",
    icon: "🚀",
    summary:
      "Urban mobility is being reimagined through micro-mobility, autonomous vehicles, and integrated MaaS platforms connecting all transit modes.",
    keyHighlights: [
      "E-bike infrastructure reshaping city transportation networks",
      "Autonomous shuttle pilots in controlled urban zones",
      "Mobility-as-a-Service integrating public and private transit",
    ],
  },
  {
    id: "mental-health",
    subject: "Digital Mental Health Solutions",
    category: "Health & Wellness",
    icon: "🧠",
    summary:
      "Digital mental health tools are scaling access to therapy, using AI for early intervention, and integrating with primary care systems.",
    keyHighlights: [
      "AI chatbots providing CBT-based support between sessions",
      "Passive sensing via smartphones detecting mood changes",
      "Employer-sponsored digital therapy platforms growing 300% YoY",
    ],
  },
  {
    id: "food-tech",
    subject: "Food Technology & Alternative Proteins",
    category: "Food & Agriculture",
    icon: "🌱",
    summary:
      "Alternative proteins and precision fermentation are disrupting traditional food systems while vertical farming brings production closer to consumers.",
    keyHighlights: [
      "Precision fermentation producing dairy-identical proteins",
      "Cultivated meat achieving price parity in select markets",
      "AI-optimized vertical farms reducing water use by 95%",
    ],
  },
  {
    id: "cybersecurity",
    subject: "Next-Gen Cybersecurity",
    category: "Technology",
    icon: "🔒",
    summary:
      "Cybersecurity is evolving with zero-trust architectures, AI-powered threat detection, and post-quantum cryptography preparation.",
    keyHighlights: [
      "AI SIEM systems reducing threat detection time to seconds",
      "Zero-trust microsegmentation replacing perimeter security",
      "Post-quantum cryptography migration becoming urgent",
    ],
  },
  {
    id: "creator-economy",
    subject: "Creator Economy & Digital Monetization",
    category: "Business",
    icon: "💰",
    summary:
      "The creator economy is maturing with professional-grade tools, diversified revenue streams, and new ownership models via tokenization.",
    keyHighlights: [
      "Creator-led brands outperforming traditional D2C companies",
      "AI-assisted content repurposing across platforms",
      "Community-owned media through token-based governance",
    ],
  },
];
