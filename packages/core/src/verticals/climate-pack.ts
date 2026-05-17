/**
 * @module verticals/climate-pack
 *
 * Comprehensive Climate Tech vertical pack with domain angles, evaluation rubrics,
 * compliance rules, glossary, and example sessions for climate and sustainability innovation.
 */

import type { ExtendedVerticalPack } from "./pack-schema";

/** Climate Tech vertical pack with full domain context. */
export const CLIMATE_PACK: ExtendedVerticalPack = {
  id: "climate",
  name: "Climate Tech & Sustainability",
  version: "1.0.0",
  description:
    "Comprehensive innovation pack for climate technology, clean energy, circular economy, and environmental sustainability with ESG evaluation rubrics, regulatory guidance, and domain expertise.",
  author: "Innovator Core Team",

  domainAngles: [
    {
      id: "carbon-impact",
      name: "Carbon Impact",
      description:
        "Innovations that measurably reduce greenhouse gas emissions across Scope 1, 2, and 3 categories.",
      promptContext:
        "Focus on direct emissions reduction, carbon capture and storage (CCS/CCUS), carbon accounting, supply chain decarbonization, and carbon offset verification. Consider GHG Protocol standards, Science Based Targets initiative (SBTi), and lifecycle carbon assessment. Quantify CO2e reduction potential with clear methodology.",
      icon: "🌡️",
    },
    {
      id: "circular-economy",
      name: "Circular Economy",
      description:
        "Design out waste and pollution through reuse, repair, remanufacturing, and regenerative systems.",
      promptContext:
        "Focus on product-as-a-service models, material passports, reverse logistics, industrial symbiosis, design for disassembly, and biodegradable materials. Consider Ellen MacArthur Foundation's butterfly diagram, cradle-to-cradle certification, and extended producer responsibility (EPR) regulations.",
      icon: "♻️",
    },
    {
      id: "climate-adaptation",
      name: "Climate Adaptation",
      description:
        "Build resilience against climate impacts including extreme weather, sea-level rise, and resource scarcity.",
      promptContext:
        "Focus on climate risk assessment, resilient infrastructure, early warning systems, water resource management, heat mitigation, and food security. Consider IPCC adaptation frameworks, climate scenario modeling (SSP/RCP pathways), and nature-based solutions. Address vulnerable communities and just transition principles.",
      icon: "🏗️",
    },
    {
      id: "clean-energy",
      name: "Clean Energy",
      description:
        "Accelerate the transition to renewable energy through generation, storage, distribution, and efficiency innovations.",
      promptContext:
        "Focus on solar, wind, and emerging renewables, grid-scale energy storage, smart grid optimization, green hydrogen, and energy efficiency. Consider LCOE comparisons, grid interconnection challenges, permitting processes, and energy justice. Address intermittency, curtailment, and demand response strategies.",
      icon: "⚡",
    },
    {
      id: "sustainable-materials",
      name: "Sustainable Materials",
      description:
        "Develop and scale low-carbon, renewable, and non-toxic materials to replace conventional alternatives.",
      promptContext:
        "Focus on bio-based materials, green chemistry, sustainable textiles, low-carbon cement and steel, alternative proteins, and packaging innovation. Consider lifecycle assessment (LCA), material flow analysis, embodied carbon, and scalability of novel materials. Address cost parity and performance requirements.",
      icon: "🧪",
    },
  ],

  evaluationRubrics: [
    {
      id: "climate-innovation",
      name: "Climate Innovation Assessment",
      criteria: [
        {
          name: "Carbon Reduction Potential",
          description:
            "What is the quantifiable CO2e reduction potential? Consider direct and indirect emissions, rebound effects, and scalability of the carbon benefit.",
          weight: 0.25,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Scalability",
          description:
            "Can the innovation scale to meaningful climate impact (gigatonne-scale)? Consider technology readiness level, supply chain constraints, and market adoption barriers.",
          weight: 0.2,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Implementation Timeline",
          description:
            "How quickly can this be deployed at scale? Consider urgency of climate action, infrastructure requirements, and regulatory approval timelines.",
          weight: 0.15,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Economic Viability",
          description:
            "Is the innovation economically viable without permanent subsidies? Consider cost curves, revenue models, carbon pricing scenarios, and green premium analysis.",
          weight: 0.15,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Social Impact",
          description:
            "Does the innovation create positive social outcomes? Consider job creation, community benefits, environmental justice, and just transition principles.",
          weight: 0.15,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Ecosystem Impact",
          description:
            "Does the innovation protect or restore natural ecosystems? Consider biodiversity, land use, water systems, and potential unintended environmental consequences.",
          weight: 0.1,
          scaleMin: 0,
          scaleMax: 10,
        },
      ],
      passingScore: 5.5,
    },
  ],

  complianceRules: [
    {
      id: "eu-green-deal",
      name: "EU Green Deal Alignment",
      regulation: "EU Green Deal / CSRD / EU Taxonomy",
      description:
        "Innovations targeting EU markets must align with the European Green Deal objectives, Corporate Sustainability Reporting Directive, and EU Taxonomy for sustainable activities.",
      severity: "high",
      checkFunction:
        "Check if the idea targets EU markets or multinational operations. Verify alignment with EU Taxonomy technical screening criteria, CSRD disclosure requirements, and Do No Significant Harm (DNSH) principles.",
      autoDetectable: true,
    },
    {
      id: "paris-agreement",
      name: "Paris Agreement Targets",
      regulation: "Paris Agreement / NDCs",
      description:
        "Climate innovations should demonstrate alignment with Paris Agreement 1.5°C pathway and nationally determined contributions (NDCs).",
      severity: "high",
      checkFunction:
        "Verify the idea supports Paris Agreement goals with quantifiable emissions reduction. Check alignment with Science Based Targets initiative (SBTi) methodology and relevant national climate commitments.",
      autoDetectable: false,
    },
    {
      id: "esg-reporting",
      name: "ESG Reporting Standards",
      regulation: "ISSB IFRS S1/S2 / GRI / TCFD",
      description:
        "Sustainability claims must be supported by recognized ESG reporting frameworks with verifiable metrics and transparent methodology.",
      severity: "medium",
      checkFunction:
        "Check if the idea makes sustainability claims that require ESG disclosure. Verify alignment with ISSB standards, GRI reporting guidelines, and TCFD climate risk disclosure recommendations.",
      autoDetectable: true,
    },
    {
      id: "carbon-credit-verification",
      name: "Carbon Credit Verification",
      regulation: "Verra VCS / Gold Standard / ACR",
      description:
        "Carbon offset or credit claims must follow established verification standards ensuring additionality, permanence, and avoidance of double-counting.",
      severity: "high",
      checkFunction:
        "Determine if the idea involves carbon credits or offset claims. Verify adherence to recognized standards (Verra, Gold Standard, ACR) for additionality, baseline methodology, permanence, leakage assessment, and registry tracking.",
      autoDetectable: true,
    },
    {
      id: "greenwashing-detection",
      name: "Greenwashing Prevention",
      regulation: "FTC Green Guides / EU Green Claims Directive",
      description:
        "Environmental claims must be specific, substantiated, and not misleading. Avoid vague terms like 'eco-friendly' or 'green' without quantifiable evidence.",
      severity: "medium",
      checkFunction:
        "Review the idea for unsubstantiated environmental claims. Check for specific and measurable sustainability metrics, third-party verification, and compliance with FTC Green Guides and EU Green Claims Directive requirements.",
      autoDetectable: true,
    },
  ],

  glossary: {
    GHG: "Greenhouse Gas — gases that trap heat in the atmosphere (CO2, CH4, N2O, HFCs, PFCs, SF6)",
    CO2e: "Carbon Dioxide Equivalent — standard unit for measuring carbon footprints across different greenhouse gases",
    "Scope 1": "Direct GHG emissions from owned or controlled sources",
    "Scope 2": "Indirect GHG emissions from purchased electricity, steam, heating, and cooling",
    "Scope 3": "All other indirect GHG emissions in the value chain (upstream and downstream)",
    SBTi: "Science Based Targets initiative — framework for corporate emissions reduction targets aligned with climate science",
    TCFD: "Task Force on Climate-Related Financial Disclosures — framework for climate risk reporting",
    ISSB: "International Sustainability Standards Board — global baseline for sustainability disclosures",
    LCA: "Life Cycle Assessment — methodology for evaluating environmental impacts across a product's entire lifecycle",
    "Circular Economy":
      "Economic system aimed at eliminating waste through continual use of resources",
    EPR: "Extended Producer Responsibility — policy making manufacturers responsible for end-of-life product management",
    CCS: "Carbon Capture and Storage — technology capturing CO2 from sources and storing it underground",
    CCUS: "Carbon Capture, Utilization, and Storage — CCS plus use of captured CO2 in products or processes",
    DAC: "Direct Air Capture — technology that captures CO2 directly from ambient air",
    BECCS:
      "Bioenergy with Carbon Capture and Storage — negative emissions technology combining biomass energy with CCS",
    NbS: "Nature-based Solutions — actions that protect and manage natural ecosystems to address societal challenges",
    LCOE: "Levelized Cost of Energy — average cost of electricity generation over a power plant's lifetime",
    PPA: "Power Purchase Agreement — contract between electricity generator and buyer for renewable energy",
    REC: "Renewable Energy Certificate — tradable proof of renewable electricity generation",
    "Green Hydrogen": "Hydrogen produced via electrolysis using renewable electricity",
    "Green Premium":
      "Additional cost of choosing a clean technology over its fossil fuel alternative",
    "Carbon Budget":
      "Cumulative amount of CO2 that can be emitted while limiting warming to a target",
    NDC: "Nationally Determined Contribution — country-level climate action plan under the Paris Agreement",
    "Just Transition":
      "Framework ensuring climate action is equitable and does not disproportionately burden vulnerable communities",
    ESG: "Environmental, Social, and Governance — framework for evaluating corporate sustainability and ethical impact",
    CSRD: "Corporate Sustainability Reporting Directive — EU directive requiring sustainability disclosures",
    "EU Taxonomy":
      "Classification system defining environmentally sustainable economic activities in the EU",
    TRL: "Technology Readiness Level — scale from 1-9 measuring maturity of a technology for deployment",
    "Material Passport":
      "Digital record documenting materials and components in a product for circular economy tracking",
    "Industrial Symbiosis": "Network where waste from one industry becomes input for another",
    "Embodied Carbon":
      "Total GHG emissions from manufacturing, transport, and installation of building materials",
    Additionality:
      "Principle that carbon credits represent emission reductions beyond business-as-usual",
  },

  exampleSessions: [
    {
      subject: "Industrial decarbonization for hard-to-abate sectors",
      description:
        "Explore innovations to decarbonize heavy industry sectors like steel, cement, chemicals, and shipping that are difficult to electrify.",
      expectedAngles: [
        "carbon-impact",
        "clean-energy",
        "sustainable-materials",
        "circular-economy",
      ],
      sampleInsights: [
        "Green hydrogen-based direct reduced iron (DRI) for carbon-free steelmaking",
        "Carbon mineralization in cement production turning CO2 into building materials",
        "Industrial heat pump networks recovering waste heat across manufacturing clusters",
        "Digital material passports enabling industrial symbiosis and cross-sector waste valorization",
      ],
    },
    {
      subject: "Regenerative agriculture and soil carbon sequestration",
      description:
        "Investigate technologies and practices for transitioning to regenerative agriculture while generating verified carbon credits.",
      expectedAngles: [
        "carbon-impact",
        "circular-economy",
        "sustainable-materials",
        "climate-adaptation",
      ],
      sampleInsights: [
        "Satellite and IoT-based soil carbon measurement for MRV (measurement, reporting, verification)",
        "Biochar production from agricultural waste with co-benefits for soil health and carbon sequestration",
        "Cover crop optimization using AI and local climate data for maximum carbon uptake",
        "Farmer-facing platforms connecting regenerative practices to carbon credit markets with fair pricing",
      ],
    },
    {
      subject: "Urban heat mitigation and climate-resilient cities",
      description:
        "Explore solutions for reducing urban heat island effects and building climate resilience in cities facing increasing temperatures.",
      expectedAngles: [
        "climate-adaptation",
        "clean-energy",
        "sustainable-materials",
        "carbon-impact",
      ],
      sampleInsights: [
        "AI-optimized urban tree canopy planning maximizing cooling impact per square meter",
        "Cool roof and pavement materials with high solar reflectance reducing surface temperatures by 20-30°C",
        "District cooling networks using waste heat and renewable energy for energy-efficient urban cooling",
        "Digital twin city platforms modeling heat vulnerability for targeted intervention planning",
      ],
    },
  ],

  biomimicrySubset: [
    "Termite mound ventilation — passive cooling and air circulation for buildings",
    "Mangrove root systems — coastal resilience and carbon sequestration",
    "Photosynthesis efficiency — solar energy conversion optimization",
    "Whale fin tubercles — wind turbine blade efficiency improvements",
    "Prairie grassland root networks — deep soil carbon storage patterns",
    "Coral reef calcium carbonate — carbon mineralization in building materials",
    "Mycelium decomposition networks — organic waste processing and material creation",
    "Leaf surface hydrophobicity — self-cleaning solar panel coatings",
  ],

  metadata: {
    tags: [
      "climate",
      "cleantech",
      "sustainability",
      "carbon",
      "renewable-energy",
      "circular-economy",
      "ESG",
      "green-hydrogen",
      "decarbonization",
      "nature-based-solutions",
    ],
    icon: "🌍",
    color: "#22C55E",
  },
};
