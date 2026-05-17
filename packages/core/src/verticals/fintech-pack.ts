/**
 * @module verticals/fintech-pack
 *
 * Comprehensive Fintech vertical pack with domain angles, evaluation rubrics,
 * compliance rules, glossary, and example sessions for financial technology innovation.
 */

import type { ExtendedVerticalPack } from "./pack-schema";

/** Fintech vertical pack with full domain context. */
export const FINTECH_PACK: ExtendedVerticalPack = {
  id: "fintech",
  name: "Financial Technology",
  version: "1.0.0",
  description:
    "Comprehensive innovation pack for financial technology, payments, banking, lending, and insurance with regulatory guidance, risk evaluation rubrics, and domain expertise.",
  author: "Innovator Core Team",

  domainAngles: [
    {
      id: "regulatory-compliance",
      name: "Regulatory Compliance",
      description:
        "Navigate complex financial regulations and build compliance-first fintech products across jurisdictions.",
      promptContext:
        "Focus on KYC/AML automation, RegTech solutions, regulatory reporting, compliance monitoring, and cross-border regulatory harmonization. Consider PSD2/PSD3 open banking, SEC/FINRA requirements, and state money transmitter licenses. Address model risk management and fair lending requirements.",
      icon: "📜",
    },
    {
      id: "risk-assessment",
      name: "Risk Assessment",
      description:
        "Innovative approaches to credit risk, market risk, operational risk, and fraud detection using advanced analytics.",
      promptContext:
        "Focus on alternative data for credit scoring, real-time risk monitoring, stress testing, counterparty risk, and explainable AI for credit decisions. Consider Basel III/IV capital requirements, model validation frameworks, and scenario analysis. Address algorithmic fairness and disparate impact testing.",
      icon: "📊",
    },
    {
      id: "financial-inclusion",
      name: "Financial Inclusion",
      description:
        "Expand access to financial services for unbanked and underbanked populations globally.",
      promptContext:
        "Focus on mobile-first banking, micro-lending, digital identity for KYC, cross-border remittances, savings products for low-income users, and financial literacy tools. Consider agent banking networks, USSD-based services for feature phones, and partnership models with community organizations.",
      icon: "🌍",
    },
    {
      id: "fraud-prevention",
      name: "Fraud Prevention",
      description:
        "Advanced fraud detection, prevention, and identity verification using AI/ML and behavioral analytics.",
      promptContext:
        "Focus on real-time transaction monitoring, synthetic identity fraud detection, account takeover prevention, payment fraud patterns, and behavioral biometrics. Consider graph analytics for fraud ring detection, device fingerprinting, and balancing friction with security. Address false positive reduction strategies.",
      icon: "🛡️",
    },
    {
      id: "market-innovation",
      name: "Market Innovation",
      description:
        "Novel financial products, embedded finance, and platform-based financial services.",
      promptContext:
        "Focus on embedded finance APIs, Banking-as-a-Service (BaaS), buy-now-pay-later (BNPL), parametric insurance, tokenized assets, and decentralized finance (DeFi) integration with traditional finance. Consider revenue models, distribution strategies, and regulatory sandbox opportunities.",
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
            "Does the innovation address applicable financial regulations (KYC/AML, PCI DSS, SOX, PSD2)? Is the regulatory pathway clear and feasible?",
          weight: 0.25,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Risk-Return Profile",
          description:
            "Is the risk-return profile attractive? Consider credit risk, operational risk, market risk, and technology risk relative to expected returns.",
          weight: 0.2,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Market Size/Opportunity",
          description:
            "Is the addressable market large enough to support the innovation? Consider TAM/SAM/SOM, competitive landscape, and timing.",
          weight: 0.2,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Technical Feasibility",
          description:
            "Can the technology be built reliably and securely? Consider infrastructure requirements, API dependencies, data availability, and cybersecurity posture.",
          weight: 0.15,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Financial Inclusion Impact",
          description:
            "Does the innovation improve financial access for underserved populations? Consider affordability, accessibility, and cultural appropriateness.",
          weight: 0.1,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Scalability",
          description:
            "Can the solution scale efficiently across users, geographies, and transaction volumes without proportional cost increases?",
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
        "Financial services must implement Know Your Customer identity verification and Anti-Money Laundering transaction monitoring, suspicious activity reporting, and customer due diligence.",
      severity: "critical",
      checkFunction:
        "Check if the idea involves customer onboarding, account opening, or money movement. Verify identity verification procedures, transaction monitoring, SAR filing capabilities, and sanctions screening are addressed.",
      autoDetectable: true,
    },
    {
      id: "pci-dss",
      name: "PCI DSS Compliance",
      regulation: "PCI DSS v4.0",
      description:
        "Any system handling payment card data must comply with Payment Card Industry Data Security Standard requirements for data protection, access control, and network security.",
      severity: "critical",
      checkFunction:
        "Determine if the idea processes, stores, or transmits cardholder data. Verify encryption, tokenization, access controls, network segmentation, and vulnerability management are addressed.",
      autoDetectable: true,
    },
    {
      id: "sox-compliance",
      name: "SOX Financial Controls",
      regulation: "Sarbanes-Oxley Act (SOX)",
      description:
        "Public companies and their service providers must maintain internal controls over financial reporting with audit trails and segregation of duties.",
      severity: "high",
      checkFunction:
        "Check if the idea impacts financial reporting or accounting systems. Verify audit trail capabilities, segregation of duties, change management controls, and access logging are addressed.",
      autoDetectable: true,
    },
    {
      id: "basel-iii",
      name: "Basel III Capital Requirements",
      regulation: "Basel III Framework (BCBS)",
      description:
        "Banking innovations must consider capital adequacy, liquidity requirements, and leverage ratio constraints under the Basel III framework.",
      severity: "high",
      checkFunction:
        "Determine if the idea affects bank capital ratios, liquidity coverage, or leverage. Verify risk-weighted asset calculations, stress testing considerations, and capital buffer implications are addressed.",
      autoDetectable: false,
    },
    {
      id: "gdpr-financial",
      name: "GDPR Financial Data Protection",
      regulation: "EU GDPR (Articles 6, 9, 22)",
      description:
        "Financial data processing must comply with GDPR requirements including lawful basis, data minimization, right to explanation for automated decisions, and cross-border data transfer restrictions.",
      severity: "high",
      checkFunction:
        "Check if the idea processes EU customer financial data. Verify lawful basis for processing, data subject rights (access, erasure, portability), automated decision-making safeguards, and data transfer mechanisms are addressed.",
      autoDetectable: true,
    },
  ],

  glossary: {
    KYC: "Know Your Customer — identity verification process required for financial account opening",
    AML: "Anti-Money Laundering — regulations and procedures to prevent money laundering activities",
    DeFi: "Decentralized Finance — financial services built on blockchain without traditional intermediaries",
    BaaS: "Banking-as-a-Service — platform enabling non-banks to offer financial products via APIs",
    BNPL: "Buy Now Pay Later — point-of-sale installment payment product",
    PSD2: "Payment Services Directive 2 — EU regulation enabling open banking and strong customer authentication",
    SCA: "Strong Customer Authentication — PSD2 requirement for two-factor authentication in payments",
    PCI: "Payment Card Industry — standards body governing payment card data security",
    SOX: "Sarbanes-Oxley Act — US law mandating financial reporting controls for public companies",
    "Basel III":
      "International regulatory framework for bank capital adequacy, stress testing, and liquidity",
    SAR: "Suspicious Activity Report — report filed with FinCEN for potentially suspicious transactions",
    CTR: "Currency Transaction Report — report required for cash transactions exceeding $10,000",
    SWIFT:
      "Society for Worldwide Interbank Financial Telecommunication — global financial messaging network",
    ISO20022:
      "International standard for electronic data interchange between financial institutions",
    ACH: "Automated Clearing House — US electronic funds transfer network for batch payments",
    RTP: "Real-Time Payments — instant payment systems enabling immediate fund transfers",
    FedNow: "Federal Reserve instant payment service for real-time gross settlement",
    "Open Banking":
      "Framework allowing third-party access to banking data via APIs with customer consent",
    "Embedded Finance":
      "Integration of financial services into non-financial platforms and customer journeys",
    RegTech: "Regulatory Technology — technology solutions for regulatory compliance automation",
    SupTech:
      "Supervisory Technology — technology used by regulators for market oversight and monitoring",
    CDD: "Customer Due Diligence — process of verifying customer identity and assessing risk",
    EDD: "Enhanced Due Diligence — additional verification for higher-risk customers and transactions",
    PEP: "Politically Exposed Person — individual with prominent public function requiring enhanced scrutiny",
    MiCA: "Markets in Crypto-Assets — EU regulation for cryptocurrency and digital asset markets",
    CBDC: "Central Bank Digital Currency — digital form of a country's fiat currency issued by central bank",
    Tokenization: "Process of replacing sensitive data with non-sensitive placeholder tokens",
    "A2A Payments": "Account-to-Account Payments — direct bank transfers bypassing card networks",
    LTV: "Loan-to-Value — ratio comparing loan amount to the appraised value of the asset",
    APR: "Annual Percentage Rate — annualized interest rate including fees and charges",
    "Credit Scoring":
      "Statistical analysis of creditworthiness based on credit history and alternative data",
    "Parametric Insurance":
      "Insurance that pays out based on predefined trigger events rather than actual losses",
  },

  exampleSessions: [
    {
      subject: "Cross-border payments for emerging markets",
      description:
        "Explore innovations in cross-border payment infrastructure to reduce costs and increase speed for remittances and B2B payments in emerging markets.",
      expectedAngles: [
        "financial-inclusion",
        "regulatory-compliance",
        "market-innovation",
        "fraud-prevention",
      ],
      sampleInsights: [
        "Blockchain-based remittance corridors with stablecoin settlement reducing fees below 1%",
        "Multi-rail payment orchestration selecting optimal routes based on cost, speed, and compliance",
        "Mobile money interoperability platform connecting fragmented payment ecosystems across Africa",
        "AI-powered sanctions screening optimized for high-volume emerging market corridors",
      ],
    },
    {
      subject: "AI-powered credit scoring for thin-file consumers",
      description:
        "Investigate alternative data and AI/ML approaches to credit scoring for consumers with limited traditional credit history.",
      expectedAngles: [
        "risk-assessment",
        "financial-inclusion",
        "regulatory-compliance",
        "market-innovation",
      ],
      sampleInsights: [
        "Cashflow-based underwriting using open banking data for real-time income verification",
        "Explainable AI credit models meeting ECOA adverse action notice requirements",
        "Rent and utility payment reporting platforms building credit history for underserved consumers",
        "Federated learning for credit models trained across institutions without sharing customer data",
      ],
    },
    {
      subject: "Embedded finance for SaaS platforms",
      description:
        "Explore opportunities to embed financial services (payments, lending, insurance) into vertical SaaS platforms.",
      expectedAngles: [
        "market-innovation",
        "regulatory-compliance",
        "risk-assessment",
        "fraud-prevention",
      ],
      sampleInsights: [
        "Revenue-based financing embedded in SaaS dashboards using real-time platform analytics",
        "Embedded insurance products with parametric triggers based on SaaS operational data",
        "White-label KYC/AML orchestration enabling SaaS platforms to onboard financial features rapidly",
        "API-first treasury management tools for SaaS platforms holding customer funds",
      ],
    },
  ],

  biomimicrySubset: [
    "Ant colony optimization — distributed decision-making for transaction routing",
    "Murmuration flocking — swarm intelligence for market pattern detection",
    "Spider web tensile strength — resilient network architecture for payment systems",
    "Beaver dam engineering — adaptive flow control and risk pooling",
    "Mycorrhizal fungal networks — resource distribution and interconnected value exchange",
    "Octopus camouflage — adaptive fraud detection and behavioral pattern matching",
    "Coral reef ecosystem diversity — portfolio diversification and systemic resilience",
    "Honeybee waggle dance — efficient information sharing for price discovery",
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
