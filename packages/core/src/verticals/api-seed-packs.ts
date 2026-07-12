/**
 * @module verticals/api-seed-packs
 *
 * Compatibility seed payloads used by the vertical packs HTTP API.
 */

import type { ExtendedVerticalPack } from "./pack-schema.js";

function seedHealthcarePack(): ExtendedVerticalPack {
  return {
    id: "healthcare",
    name: "Healthcare & Life Sciences",
    version: "1.0.0",
    description:
      "Comprehensive innovation pack for healthcare technology, digital health, medical devices, and life sciences with regulatory guidance, clinical evaluation rubrics, and domain expertise.",
    author: "Innovator Core Team",
    domainAngles: [
      {
        id: "patient-safety",
        name: "Patient Safety",
        description:
          "Innovations that reduce medical errors, adverse events, and improve patient safety outcomes.",
        promptContext:
          "Focus on reducing medication errors, surgical complications, hospital-acquired infections, diagnostic errors. Reference Joint Commission standards and WHO patient safety goals.",
        icon: "🛡️",
      },
      {
        id: "clinical-workflow",
        name: "Clinical Workflow",
        description:
          "Streamline clinical workflows to reduce physician burnout and optimize resource allocation.",
        promptContext:
          "Focus on EHR workflow optimization, clinical documentation improvement, care team communication. Consider FHIR APIs, HL7 messaging, and SMART on FHIR apps.",
        icon: "⚕️",
      },
      {
        id: "health-equity",
        name: "Health Equity",
        description:
          "Address disparities in healthcare access, outcomes, and quality across diverse populations.",
        promptContext:
          "Focus on social determinants of health, health literacy, language access, rural healthcare access, and digital divide.",
        icon: "⚖️",
      },
      {
        id: "regulatory-pathway",
        name: "Regulatory Pathway",
        description:
          "Navigate FDA, EMA, and global regulatory pathways for digital health products.",
        promptContext:
          "Focus on FDA 510(k), De Novo, PMA pathways, SaMD classification, and real-world evidence requirements.",
        icon: "📋",
      },
      {
        id: "digital-health",
        name: "Digital Health",
        description:
          "Leverage mobile health, wearables, remote monitoring, and AI/ML for care delivery.",
        promptContext:
          "Focus on RPM, digital therapeutics, AI-assisted diagnostics, predictive analytics, and virtual care platforms.",
        icon: "📱",
      },
    ],
    evaluationRubrics: [
      {
        id: "healthcare-innovation",
        name: "Healthcare Innovation Assessment",
        criteria: [
          {
            name: "Patient Safety Impact",
            description:
              "Does the innovation directly improve patient safety or reduce medical errors?",
            weight: 0.25,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Clinical Evidence Requirements",
            description: "Is the clinical evidence pathway clear?",
            weight: 0.2,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "HIPAA Compliance",
            description: "Does the innovation adequately address PHI handling and data security?",
            weight: 0.2,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Implementation Feasibility",
            description: "Can this be implemented within existing healthcare infrastructure?",
            weight: 0.15,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Health Equity Impact",
            description: "Does the innovation improve or worsen health equity?",
            weight: 0.1,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Cost-Effectiveness",
            description: "Is the innovation cost-effective relative to existing alternatives?",
            weight: 0.1,
            scaleMin: 0,
            scaleMax: 10,
          },
        ],
        passingScore: 6.0,
      },
    ],
    complianceRules: [
      {
        id: "hipaa-phi",
        name: "HIPAA PHI Handling",
        regulation: "HIPAA Privacy Rule (45 CFR §164.500-534)",
        description:
          "Any innovation handling PHI must implement minimum necessary access and de-identification standards.",
        severity: "critical",
        checkFunction:
          "Check if the idea involves collecting, storing, or processing any of the 18 HIPAA identifiers.",
        autoDetectable: true,
      },
      {
        id: "fda-device-class",
        name: "FDA Device Classification",
        regulation: "FDA 21 CFR Part 820",
        description:
          "Software intended for medical purposes must be assessed for FDA device classification.",
        severity: "critical",
        checkFunction:
          "Determine if the software meets the definition of a medical device or SaMD.",
        autoDetectable: true,
      },
      {
        id: "clinical-trial-req",
        name: "Clinical Trial Requirements",
        regulation: "FDA 21 CFR Parts 50, 56, 312",
        description:
          "Innovations making clinical efficacy claims may require clinical trials with IRB approval.",
        severity: "high",
        checkFunction:
          "Check if the idea makes therapeutic or diagnostic claims requiring clinical trial evidence.",
        autoDetectable: false,
      },
      {
        id: "patient-consent",
        name: "Patient Consent Requirements",
        regulation: "HIPAA Authorization (45 CFR §164.508)",
        description:
          "Patient consent must be obtained for uses of PHI beyond treatment, payment, and operations.",
        severity: "high",
        checkFunction: "Verify the idea includes patient consent workflows for data usage.",
        autoDetectable: true,
      },
      {
        id: "data-retention",
        name: "Data Retention Policies",
        regulation: "HIPAA (45 CFR §164.530(j))",
        description: "Medical records and PHI must be retained per federal and state requirements.",
        severity: "medium",
        checkFunction:
          "Check if the idea addresses data retention timelines and secure data destruction.",
        autoDetectable: true,
      },
    ],
    glossary: {
      PHI: "Protected Health Information — individually identifiable health information covered by HIPAA",
      EHR: "Electronic Health Record — digital version of a patient's paper chart",
      FHIR: "Fast Healthcare Interoperability Resources — HL7 standard for healthcare data exchange",
      "ICD-10":
        "International Classification of Diseases, 10th Revision — WHO diagnostic coding system",
      CPT: "Current Procedural Terminology — AMA coding system for medical procedures",
      SaMD: "Software as a Medical Device — software intended for medical purposes",
      DTx: "Digital Therapeutics — evidence-based software-driven interventions",
      RPM: "Remote Patient Monitoring — technology to monitor patients outside clinical settings",
      SDOH: "Social Determinants of Health — economic and social conditions influencing health outcomes",
      HIPAA: "Health Insurance Portability and Accountability Act — US health data privacy law",
      HL7: "Health Level Seven — standards framework for health information exchange",
      HCAHPS:
        "Hospital Consumer Assessment of Healthcare Providers and Systems — patient satisfaction survey",
      QALY: "Quality-Adjusted Life Year — measure combining quality and quantity of life",
      NPI: "National Provider Identifier — unique identification for healthcare providers",
      BAA: "Business Associate Agreement — HIPAA-required contract for entities handling PHI",
      "FDA 510(k)":
        "Premarket notification for devices substantially equivalent to marketed devices",
      "De Novo": "FDA regulatory pathway for novel low-to-moderate risk devices",
      PMA: "Premarket Approval — FDA pathway for Class III (high-risk) medical devices",
      GCP: "Good Clinical Practice — international standard for clinical trials",
      IRB: "Institutional Review Board — committee reviewing biomedical research",
      RWE: "Real-World Evidence — clinical evidence from analysis of real-world data",
      CDS: "Clinical Decision Support — tools providing patient-specific information to clinicians",
      SMART:
        "Substitutable Medical Applications, Reusable Technologies — EHR-integrated app framework",
      HIE: "Health Information Exchange — electronic sharing of health info across organizations",
      ACO: "Accountable Care Organization — provider groups jointly accountable for quality and cost",
      VBC: "Value-Based Care — delivery model rewarding quality outcomes over volume",
      EMR: "Electronic Medical Record — digital record within a single practice",
      RTM: "Remote Therapeutic Monitoring — monitoring medication adherence and response",
      PHR: "Personal Health Record — patient-managed record of health information",
      CDI: "Clinical Documentation Improvement — process improving record accuracy",
      UDI: "Unique Device Identification — FDA system for identifying medical devices",
    },
    exampleSessions: [
      {
        subject: "Remote patient monitoring for chronic disease management",
        description: "Explore innovations in RPM for managing diabetes, heart failure, and COPD.",
        expectedAngles: ["digital-health", "patient-safety", "clinical-workflow"],
        sampleInsights: [
          "AI-powered RPM with predictive alerts for early deterioration detection",
          "Integration of continuous glucose monitors with EHR",
        ],
      },
      {
        subject: "AI-assisted diagnostics in radiology",
        description: "Investigate AI/ML applications for improving diagnostic accuracy.",
        expectedAngles: ["patient-safety", "regulatory-pathway", "clinical-workflow"],
        sampleInsights: [
          "FDA-cleared AI triage tools for critical findings",
          "Federated learning for diagnostic models across institutions",
        ],
      },
      {
        subject: "Mental health accessibility through digital platforms",
        description: "Explore digital solutions to improve access to mental health services.",
        expectedAngles: ["health-equity", "digital-health", "patient-safety"],
        sampleInsights: [
          "Digital CBT platform with culturally adapted content",
          "AI-powered crisis detection with real-time safety protocols",
        ],
      },
    ],
    biomimicrySubset: [
      "Immune system adaptive response",
      "Neural network signal propagation",
      "Wound healing cascade",
      "Symbiotic microbiome relationships",
    ],
    metadata: {
      tags: [
        "healthcare",
        "healthtech",
        "digital-health",
        "medtech",
        "HIPAA",
        "FDA",
        "patient-safety",
        "telehealth",
      ],
      icon: "🏥",
      color: "#0EA5E9",
    },
  };
}

function seedFintechPack(): ExtendedVerticalPack {
  return {
    id: "fintech",
    name: "Financial Technology",
    version: "1.0.0",
    description:
      "Comprehensive innovation pack for financial technology, payments, banking, lending, and insurance with regulatory guidance and risk evaluation rubrics.",
    author: "Innovator Core Team",
    domainAngles: [
      {
        id: "regulatory-compliance",
        name: "Regulatory Compliance",
        description:
          "Navigate complex financial regulations and build compliance-first fintech products.",
        promptContext:
          "Focus on KYC/AML automation, RegTech solutions, regulatory reporting, and cross-border harmonization.",
        icon: "📜",
      },
      {
        id: "risk-assessment",
        name: "Risk Assessment",
        description: "Innovative approaches to credit risk, market risk, and fraud detection.",
        promptContext:
          "Focus on alternative data for credit scoring, real-time risk monitoring, and explainable AI for credit decisions.",
        icon: "📊",
      },
      {
        id: "financial-inclusion",
        name: "Financial Inclusion",
        description:
          "Expand access to financial services for unbanked and underbanked populations.",
        promptContext:
          "Focus on mobile-first banking, micro-lending, digital identity for KYC, and cross-border remittances.",
        icon: "🌍",
      },
      {
        id: "fraud-prevention",
        name: "Fraud Prevention",
        description: "Advanced fraud detection, prevention, and identity verification using AI/ML.",
        promptContext:
          "Focus on real-time transaction monitoring, synthetic identity fraud detection, and behavioral biometrics.",
        icon: "🛡️",
      },
      {
        id: "market-innovation",
        name: "Market Innovation",
        description:
          "Novel financial products, embedded finance, and platform-based financial services.",
        promptContext:
          "Focus on embedded finance APIs, BaaS, BNPL, parametric insurance, and DeFi integration.",
        icon: "🚀",
      },
    ],
    evaluationRubrics: [
      {
        id: "fintech-innovation",
        name: "Fintech Innovation Assessment",
        criteria: [
          {
            name: "Regulatory Compliance",
            description:
              "Does the innovation address applicable financial regulations (KYC/AML, PCI DSS, SOX)?",
            weight: 0.25,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Risk-Return Profile",
            description:
              "Is the risk-return profile attractive considering credit, operational, and technology risk?",
            weight: 0.2,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Market Size/Opportunity",
            description:
              "Is the addressable market large enough? Consider TAM/SAM/SOM and competitive landscape.",
            weight: 0.2,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Technical Feasibility",
            description: "Can the technology be built reliably and securely?",
            weight: 0.15,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Financial Inclusion Impact",
            description:
              "Does the innovation improve financial access for underserved populations?",
            weight: 0.1,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Scalability",
            description: "Can the solution scale efficiently across users and geographies?",
            weight: 0.1,
            scaleMin: 0,
            scaleMax: 10,
          },
        ],
        passingScore: 6.0,
      },
    ],
    complianceRules: [
      {
        id: "kyc-aml",
        name: "KYC/AML Requirements",
        regulation: "Bank Secrecy Act (BSA) / EU AMLD6",
        description:
          "Financial services must implement KYC identity verification and AML transaction monitoring.",
        severity: "critical",
        checkFunction:
          "Check if the idea involves customer onboarding or money movement. Verify identity verification and transaction monitoring.",
        autoDetectable: true,
      },
      {
        id: "pci-dss",
        name: "PCI DSS Compliance",
        regulation: "PCI DSS v4.0",
        description: "Systems handling payment card data must comply with PCI DSS requirements.",
        severity: "critical",
        checkFunction:
          "Determine if the idea processes or stores cardholder data. Verify encryption and access controls.",
        autoDetectable: true,
      },
      {
        id: "sox-compliance",
        name: "SOX Financial Controls",
        regulation: "Sarbanes-Oxley Act (SOX)",
        description: "Public companies must maintain internal controls over financial reporting.",
        severity: "high",
        checkFunction:
          "Check if the idea impacts financial reporting. Verify audit trail and segregation of duties.",
        autoDetectable: true,
      },
      {
        id: "basel-iii",
        name: "Basel III Capital Requirements",
        regulation: "Basel III Framework (BCBS)",
        description:
          "Banking innovations must consider capital adequacy and liquidity requirements.",
        severity: "high",
        checkFunction: "Determine if the idea affects bank capital ratios or liquidity coverage.",
        autoDetectable: false,
      },
      {
        id: "gdpr-financial",
        name: "GDPR Financial Data Protection",
        regulation: "EU GDPR (Articles 6, 9, 22)",
        description: "Financial data processing must comply with GDPR requirements.",
        severity: "high",
        checkFunction:
          "Check if the idea processes EU customer financial data. Verify lawful basis and data subject rights.",
        autoDetectable: true,
      },
    ],
    glossary: {
      KYC: "Know Your Customer — identity verification for financial account opening",
      AML: "Anti-Money Laundering — regulations to prevent money laundering",
      DeFi: "Decentralized Finance — financial services on blockchain without traditional intermediaries",
      BaaS: "Banking-as-a-Service — platform enabling non-banks to offer financial products via APIs",
      BNPL: "Buy Now Pay Later — point-of-sale installment payment product",
      PSD2: "Payment Services Directive 2 — EU regulation enabling open banking",
      SCA: "Strong Customer Authentication — PSD2 requirement for two-factor auth in payments",
      PCI: "Payment Card Industry — standards body for payment card data security",
      SOX: "Sarbanes-Oxley Act — US law for financial reporting controls",
      "Basel III": "International regulatory framework for bank capital adequacy",
      SAR: "Suspicious Activity Report — report for potentially suspicious transactions",
      SWIFT: "Society for Worldwide Interbank Financial Telecommunication",
      ACH: "Automated Clearing House — US electronic funds transfer network",
      RTP: "Real-Time Payments — instant payment systems",
      "Open Banking": "Framework for third-party access to banking data via APIs",
      "Embedded Finance": "Integration of financial services into non-financial platforms",
      RegTech: "Regulatory Technology — solutions for compliance automation",
      CDD: "Customer Due Diligence — process of verifying customer identity and risk",
      EDD: "Enhanced Due Diligence — additional verification for higher-risk customers",
      PEP: "Politically Exposed Person — individual requiring enhanced scrutiny",
      MiCA: "Markets in Crypto-Assets — EU regulation for digital asset markets",
      CBDC: "Central Bank Digital Currency — digital form of fiat currency",
      Tokenization: "Replacing sensitive data with non-sensitive placeholder tokens",
      LTV: "Loan-to-Value — ratio comparing loan amount to asset value",
      APR: "Annual Percentage Rate — annualized interest rate including fees",
      "Credit Scoring": "Statistical analysis of creditworthiness",
      FedNow: "Federal Reserve instant payment service",
      ISO20022: "International standard for financial data interchange",
      CTR: "Currency Transaction Report — report for cash transactions over $10,000",
      SupTech: "Supervisory Technology — tech used by regulators for market oversight",
      "A2A Payments": "Account-to-Account Payments — direct bank transfers bypassing card networks",
    },
    exampleSessions: [
      {
        subject: "Cross-border payments for emerging markets",
        description: "Explore innovations in cross-border payment infrastructure.",
        expectedAngles: ["financial-inclusion", "regulatory-compliance", "market-innovation"],
        sampleInsights: [
          "Blockchain-based remittance corridors with stablecoin settlement",
          "Multi-rail payment orchestration",
        ],
      },
      {
        subject: "AI-powered credit scoring for thin-file consumers",
        description: "Investigate alternative data and AI/ML for credit scoring.",
        expectedAngles: ["risk-assessment", "financial-inclusion", "regulatory-compliance"],
        sampleInsights: [
          "Cashflow-based underwriting using open banking data",
          "Explainable AI credit models meeting ECOA requirements",
        ],
      },
      {
        subject: "Embedded finance for SaaS platforms",
        description: "Explore embedded financial services in vertical SaaS platforms.",
        expectedAngles: ["market-innovation", "regulatory-compliance", "risk-assessment"],
        sampleInsights: [
          "Revenue-based financing in SaaS dashboards",
          "White-label KYC/AML orchestration for SaaS platforms",
        ],
      },
    ],
    biomimicrySubset: [
      "Ant colony optimization for transaction routing",
      "Murmuration flocking for market pattern detection",
      "Spider web resilient network architecture",
      "Mycorrhizal networks for value exchange",
    ],
    metadata: {
      tags: [
        "fintech",
        "payments",
        "banking",
        "lending",
        "insurance",
        "regtech",
        "defi",
        "embedded-finance",
        "KYC",
        "AML",
      ],
      icon: "💰",
      color: "#10B981",
    },
  };
}

function seedClimatePack(): ExtendedVerticalPack {
  return {
    id: "climate",
    name: "Climate Tech & Sustainability",
    version: "1.0.0",
    description:
      "Comprehensive innovation pack for climate technology, clean energy, circular economy, and environmental sustainability with ESG evaluation rubrics.",
    author: "Innovator Core Team",
    domainAngles: [
      {
        id: "carbon-impact",
        name: "Carbon Impact",
        description:
          "Innovations that measurably reduce greenhouse gas emissions across Scope 1, 2, and 3.",
        promptContext:
          "Focus on direct emissions reduction, CCS/CCUS, carbon accounting, and supply chain decarbonization.",
        icon: "🌡️",
      },
      {
        id: "circular-economy",
        name: "Circular Economy",
        description:
          "Design out waste through reuse, repair, remanufacturing, and regenerative systems.",
        promptContext:
          "Focus on product-as-a-service, material passports, reverse logistics, and industrial symbiosis.",
        icon: "♻️",
      },
      {
        id: "climate-adaptation",
        name: "Climate Adaptation",
        description:
          "Build resilience against climate impacts including extreme weather and resource scarcity.",
        promptContext:
          "Focus on climate risk assessment, resilient infrastructure, early warning systems, and nature-based solutions.",
        icon: "🏗️",
      },
      {
        id: "clean-energy",
        name: "Clean Energy",
        description:
          "Accelerate the transition to renewable energy through generation, storage, and efficiency.",
        promptContext:
          "Focus on solar, wind, grid-scale storage, smart grid optimization, and green hydrogen.",
        icon: "⚡",
      },
      {
        id: "sustainable-materials",
        name: "Sustainable Materials",
        description:
          "Develop low-carbon, renewable, and non-toxic materials to replace conventional alternatives.",
        promptContext:
          "Focus on bio-based materials, green chemistry, low-carbon cement and steel, and alternative proteins.",
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
            description: "What is the quantifiable CO2e reduction potential?",
            weight: 0.25,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Scalability",
            description: "Can the innovation scale to meaningful climate impact (gigatonne-scale)?",
            weight: 0.2,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Implementation Timeline",
            description: "How quickly can this be deployed at scale?",
            weight: 0.15,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Economic Viability",
            description: "Is the innovation economically viable without permanent subsidies?",
            weight: 0.15,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Social Impact",
            description: "Does the innovation create positive social outcomes?",
            weight: 0.15,
            scaleMin: 0,
            scaleMax: 10,
          },
          {
            name: "Ecosystem Impact",
            description: "Does the innovation protect or restore natural ecosystems?",
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
        description: "Innovations targeting EU markets must align with EU Green Deal objectives.",
        severity: "high",
        checkFunction:
          "Check alignment with EU Taxonomy technical screening criteria and DNSH principles.",
        autoDetectable: true,
      },
      {
        id: "paris-agreement",
        name: "Paris Agreement Targets",
        regulation: "Paris Agreement / NDCs",
        description: "Climate innovations should align with Paris Agreement 1.5°C pathway.",
        severity: "high",
        checkFunction:
          "Verify the idea supports Paris Agreement goals with quantifiable emissions reduction.",
        autoDetectable: false,
      },
      {
        id: "esg-reporting",
        name: "ESG Reporting Standards",
        regulation: "ISSB IFRS S1/S2 / GRI / TCFD",
        description: "Sustainability claims must be supported by recognized ESG frameworks.",
        severity: "medium",
        checkFunction:
          "Check if sustainability claims require ESG disclosure and verify framework alignment.",
        autoDetectable: true,
      },
      {
        id: "carbon-credit-verification",
        name: "Carbon Credit Verification",
        regulation: "Verra VCS / Gold Standard / ACR",
        description: "Carbon offset claims must follow established verification standards.",
        severity: "high",
        checkFunction:
          "Determine if the idea involves carbon credits. Verify additionality and permanence.",
        autoDetectable: true,
      },
      {
        id: "greenwashing-detection",
        name: "Greenwashing Prevention",
        regulation: "FTC Green Guides / EU Green Claims Directive",
        description: "Environmental claims must be specific, substantiated, and not misleading.",
        severity: "medium",
        checkFunction:
          "Review for unsubstantiated environmental claims and verify measurable metrics.",
        autoDetectable: true,
      },
    ],
    glossary: {
      GHG: "Greenhouse Gas — gases trapping heat in the atmosphere (CO2, CH4, N2O, HFCs)",
      CO2e: "Carbon Dioxide Equivalent — standard unit for measuring carbon footprints",
      "Scope 1": "Direct GHG emissions from owned or controlled sources",
      "Scope 2": "Indirect GHG emissions from purchased electricity, steam, heating",
      "Scope 3": "All other indirect GHG emissions in the value chain",
      SBTi: "Science Based Targets initiative — framework for corporate emissions targets",
      TCFD: "Task Force on Climate-Related Financial Disclosures",
      ISSB: "International Sustainability Standards Board",
      LCA: "Life Cycle Assessment — methodology for evaluating environmental impacts",
      EPR: "Extended Producer Responsibility — manufacturers responsible for end-of-life management",
      CCS: "Carbon Capture and Storage — capturing CO2 from sources and storing underground",
      CCUS: "Carbon Capture, Utilization, and Storage",
      DAC: "Direct Air Capture — capturing CO2 directly from ambient air",
      BECCS: "Bioenergy with Carbon Capture and Storage — negative emissions technology",
      NbS: "Nature-based Solutions — managing natural ecosystems to address challenges",
      LCOE: "Levelized Cost of Energy — average cost of electricity generation over lifetime",
      PPA: "Power Purchase Agreement — contract for renewable energy purchase",
      REC: "Renewable Energy Certificate — proof of renewable electricity generation",
      "Green Hydrogen": "Hydrogen produced via electrolysis using renewable electricity",
      "Green Premium": "Additional cost of clean technology over fossil fuel alternative",
      "Carbon Budget": "Cumulative CO2 that can be emitted while limiting warming to target",
      NDC: "Nationally Determined Contribution — country-level climate action plan",
      "Just Transition":
        "Framework ensuring climate action is equitable for vulnerable communities",
      ESG: "Environmental, Social, and Governance — framework for sustainability evaluation",
      CSRD: "Corporate Sustainability Reporting Directive — EU sustainability disclosure directive",
      "EU Taxonomy": "Classification for environmentally sustainable economic activities in the EU",
      TRL: "Technology Readiness Level — scale measuring maturity for deployment",
      "Material Passport":
        "Digital record of materials and components for circular economy tracking",
      "Industrial Symbiosis": "Network where waste from one industry becomes input for another",
      "Embodied Carbon": "Total GHG emissions from manufacturing and installation of materials",
      Additionality: "Principle that carbon credits represent reductions beyond business-as-usual",
      "Circular Economy":
        "Economic system aimed at eliminating waste through continual resource use",
    },
    exampleSessions: [
      {
        subject: "Industrial decarbonization for hard-to-abate sectors",
        description: "Explore innovations to decarbonize steel, cement, chemicals, and shipping.",
        expectedAngles: ["carbon-impact", "clean-energy", "sustainable-materials"],
        sampleInsights: [
          "Green hydrogen-based direct reduced iron for carbon-free steelmaking",
          "Carbon mineralization in cement production",
        ],
      },
      {
        subject: "Regenerative agriculture and soil carbon sequestration",
        description:
          "Investigate technologies for regenerative agriculture and verified carbon credits.",
        expectedAngles: ["carbon-impact", "circular-economy", "sustainable-materials"],
        sampleInsights: [
          "Satellite and IoT-based soil carbon measurement for MRV",
          "Biochar from agricultural waste for soil health",
        ],
      },
      {
        subject: "Urban heat mitigation and climate-resilient cities",
        description: "Explore solutions for reducing urban heat island effects.",
        expectedAngles: ["climate-adaptation", "clean-energy", "sustainable-materials"],
        sampleInsights: [
          "AI-optimized urban tree canopy planning",
          "Cool roof materials reducing surface temperatures",
        ],
      },
    ],
    biomimicrySubset: [
      "Termite mound ventilation for passive cooling",
      "Mangrove root systems for coastal resilience",
      "Photosynthesis efficiency for solar optimization",
      "Whale fin tubercles for wind turbine blades",
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
        "decarbonization",
      ],
      icon: "🌍",
      color: "#22C55E",
    },
  };
}

export const API_VERTICAL_PACKS: readonly ExtendedVerticalPack[] = [
  seedHealthcarePack(),
  seedFintechPack(),
  seedClimatePack(),
];
