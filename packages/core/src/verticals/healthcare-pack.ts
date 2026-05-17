/**
 * @module verticals/healthcare-pack
 *
 * Comprehensive Healthcare vertical pack with domain angles, evaluation rubrics,
 * compliance rules, glossary, and example sessions for health technology innovation.
 */

import type { ExtendedVerticalPack } from "./pack-schema";

/** Healthcare vertical pack with full domain context. */
export const HEALTHCARE_PACK: ExtendedVerticalPack = {
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
        "Innovations that reduce medical errors, adverse events, and improve patient safety outcomes across clinical settings.",
      promptContext:
        "Focus on reducing medication errors, surgical complications, hospital-acquired infections, diagnostic errors, and falls. Consider alert systems, checklists, barcode verification, clinical decision support, and safety culture. Reference Joint Commission standards and WHO patient safety goals.",
      icon: "🛡️",
    },
    {
      id: "clinical-workflow",
      name: "Clinical Workflow",
      description:
        "Streamline clinical workflows to reduce physician burnout, improve care coordination, and optimize resource allocation.",
      promptContext:
        "Focus on EHR workflow optimization, clinical documentation improvement, order set management, care team communication, handoff protocols, and scheduling efficiency. Consider interoperability via FHIR APIs, HL7 messaging, and SMART on FHIR apps. Address alert fatigue and documentation burden.",
      icon: "⚕️",
    },
    {
      id: "health-equity",
      name: "Health Equity",
      description:
        "Address disparities in healthcare access, outcomes, and quality across diverse populations.",
      promptContext:
        "Focus on social determinants of health (SDOH), health literacy, language access, cultural competency, rural healthcare access, digital divide, and maternal health disparities. Consider community health workers, telehealth access programs, and bias detection in clinical algorithms.",
      icon: "⚖️",
    },
    {
      id: "regulatory-pathway",
      name: "Regulatory Pathway",
      description:
        "Navigate FDA, EMA, and global regulatory pathways for digital health products and medical devices.",
      promptContext:
        "Focus on FDA 510(k), De Novo, PMA pathways, Software as a Medical Device (SaMD) classification, Clinical Decision Support criteria, real-world evidence requirements, and post-market surveillance. Consider EU MDR, IVDR, and CE marking requirements. Address cybersecurity guidance for medical devices.",
      icon: "📋",
    },
    {
      id: "digital-health",
      name: "Digital Health",
      description:
        "Leverage mobile health, wearables, remote monitoring, and AI/ML for next-generation care delivery.",
      promptContext:
        "Focus on remote patient monitoring (RPM), digital therapeutics (DTx), AI-assisted diagnostics, predictive analytics, virtual care platforms, and patient engagement tools. Consider reimbursement pathways (CPT codes for RPM/RTM), evidence generation strategies, and integration with existing clinical workflows.",
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
            "Does the innovation directly improve patient safety, reduce medical errors, or prevent adverse events? Consider evidence basis and measurability of safety improvements.",
          weight: 0.25,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Clinical Evidence Requirements",
          description:
            "Is the clinical evidence pathway clear? Consider RCTs, observational studies, real-world evidence, and the strength of existing evidence for similar approaches.",
          weight: 0.2,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "HIPAA Compliance",
          description:
            "Does the innovation adequately address PHI handling, data security, access controls, audit trails, and breach notification requirements under HIPAA?",
          weight: 0.2,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Implementation Feasibility",
          description:
            "Can this be implemented within existing healthcare infrastructure? Consider EHR integration, clinical workflow disruption, training requirements, and IT infrastructure needs.",
          weight: 0.15,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Health Equity Impact",
          description:
            "Does the innovation improve or worsen health equity? Consider access for underserved populations, digital literacy requirements, language support, and cultural sensitivity.",
          weight: 0.1,
          scaleMin: 0,
          scaleMax: 10,
        },
        {
          name: "Cost-Effectiveness",
          description:
            "Is the innovation cost-effective relative to existing alternatives? Consider reimbursement potential, ROI timeline, and total cost of ownership for healthcare organizations.",
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
        "Any innovation handling Protected Health Information must implement minimum necessary access, de-identification standards, Business Associate Agreements, and patient authorization workflows.",
      severity: "critical",
      checkFunction:
        "Check if the idea involves collecting, storing, transmitting, or processing any of the 18 HIPAA identifiers. Verify encryption at rest and in transit, access controls, and audit logging are addressed.",
      autoDetectable: true,
    },
    {
      id: "fda-device-class",
      name: "FDA Device Classification Assessment",
      regulation: "FDA 21 CFR Part 820",
      description:
        "Software intended for medical purposes must be assessed for FDA device classification (Class I, II, or III) and appropriate premarket pathway (510(k), De Novo, PMA).",
      severity: "critical",
      checkFunction:
        "Determine if the software meets the definition of a medical device or SaMD. Assess intended use, risk classification, and whether clinical decision support exemption criteria apply under 21st Century Cures Act.",
      autoDetectable: true,
    },
    {
      id: "clinical-trial-req",
      name: "Clinical Trial Requirements",
      regulation: "FDA 21 CFR Parts 50, 56, 312",
      description:
        "Innovations making clinical efficacy claims may require clinical trials with IRB approval, informed consent, and compliance with Good Clinical Practice (GCP).",
      severity: "high",
      checkFunction:
        "Check if the idea makes therapeutic or diagnostic claims that would require clinical trial evidence. Assess whether existing literature or real-world evidence could support claims without prospective trials.",
      autoDetectable: false,
    },
    {
      id: "patient-consent",
      name: "Patient Consent Requirements",
      regulation: "HIPAA Authorization (45 CFR §164.508)",
      description:
        "Patient consent and authorization must be obtained for uses of PHI beyond treatment, payment, and healthcare operations, with clear opt-in/opt-out mechanisms.",
      severity: "high",
      checkFunction:
        "Verify the idea includes patient consent workflows for data usage, clear privacy notices, and mechanisms for patients to revoke consent and request data deletion.",
      autoDetectable: true,
    },
    {
      id: "data-retention",
      name: "Data Retention Policies",
      regulation: "HIPAA (45 CFR §164.530(j)), State Laws",
      description:
        "Medical records and PHI must be retained per federal and state requirements (typically 6-10 years), with secure destruction procedures after retention periods.",
      severity: "medium",
      checkFunction:
        "Check if the idea addresses data retention timelines, archival procedures, and secure data destruction. Verify compliance with applicable state medical records retention laws.",
      autoDetectable: true,
    },
  ],

  glossary: {
    PHI: "Protected Health Information — individually identifiable health information covered by HIPAA",
    EHR: "Electronic Health Record — digital version of a patient's paper chart",
    EMR: "Electronic Medical Record — digital record within a single practice or organization",
    FHIR: "Fast Healthcare Interoperability Resources — HL7 standard for healthcare data exchange via RESTful APIs",
    "ICD-10":
      "International Classification of Diseases, 10th Revision — WHO diagnostic coding system",
    CPT: "Current Procedural Terminology — AMA coding system for medical procedures and services",
    HL7: "Health Level Seven — standards framework for exchange of electronic health information",
    SaMD: "Software as a Medical Device — software intended to be used for medical purposes without being part of a hardware device",
    DTx: "Digital Therapeutics — evidence-based software-driven interventions for disease prevention or management",
    RPM: "Remote Patient Monitoring — technology to monitor patients outside clinical settings",
    RTM: "Remote Therapeutic Monitoring — monitoring of therapeutic data for medication adherence and response",
    SDOH: "Social Determinants of Health — economic and social conditions that influence health outcomes",
    HCAHPS:
      "Hospital Consumer Assessment of Healthcare Providers and Systems — standardized patient satisfaction survey",
    QALY: "Quality-Adjusted Life Year — measure of disease burden combining quality and quantity of life",
    NPI: "National Provider Identifier — unique identification number for healthcare providers",
    BAA: "Business Associate Agreement — HIPAA-required contract for entities handling PHI on behalf of covered entities",
    "FDA 510(k)":
      "Premarket notification demonstrating a device is substantially equivalent to a legally marketed device",
    "De Novo": "FDA regulatory pathway for novel low-to-moderate risk devices without a predicate",
    PMA: "Premarket Approval — FDA approval pathway for Class III (high-risk) medical devices",
    GCP: "Good Clinical Practice — international ethical and scientific quality standard for clinical trials",
    IRB: "Institutional Review Board — committee that reviews and monitors biomedical research involving human subjects",
    RWE: "Real-World Evidence — clinical evidence derived from analysis of real-world data (claims, EHRs, registries)",
    CDS: "Clinical Decision Support — tools providing clinicians with knowledge and patient-specific information",
    SMART:
      "Substitutable Medical Applications, Reusable Technologies — framework for EHR-integrated apps",
    HIE: "Health Information Exchange — electronic sharing of health information across organizations",
    ACO: "Accountable Care Organization — groups of providers jointly accountable for quality and cost of care",
    VBC: "Value-Based Care — healthcare delivery model rewarding quality outcomes over volume of services",
    HEDIS:
      "Healthcare Effectiveness Data and Information Set — quality measurement tool used by health plans",
    PHR: "Personal Health Record — patient-managed record of health information",
    CDI: "Clinical Documentation Improvement — process of improving healthcare record accuracy and specificity",
    PDMP: "Prescription Drug Monitoring Program — state-run database tracking controlled substance prescriptions",
    UDI: "Unique Device Identification — FDA system for identifying medical devices through distribution and use",
  },

  exampleSessions: [
    {
      subject: "Remote patient monitoring for chronic disease management",
      description:
        "Explore innovations in RPM technology for managing chronic conditions like diabetes, heart failure, and COPD in home settings.",
      expectedAngles: ["digital-health", "patient-safety", "clinical-workflow", "health-equity"],
      sampleInsights: [
        "AI-powered RPM with predictive alerts for early deterioration detection",
        "Integration of continuous glucose monitors with EHR for automated insulin dosing",
        "Culturally adapted RPM programs for underserved communities with multilingual support",
        "Reimbursement-optimized RPM workflows using CPT codes 99453-99458",
      ],
    },
    {
      subject: "AI-assisted diagnostics in radiology",
      description:
        "Investigate AI/ML applications for improving diagnostic accuracy, reducing radiologist workload, and detecting conditions earlier.",
      expectedAngles: [
        "patient-safety",
        "regulatory-pathway",
        "clinical-workflow",
        "digital-health",
      ],
      sampleInsights: [
        "FDA-cleared AI triage tools that prioritize critical findings in radiology worklists",
        "Federated learning approaches for training diagnostic models across institutions without sharing PHI",
        "AI-augmented screening programs for early cancer detection with reduced false positive rates",
        "SaMD classification strategy for AI diagnostic aids under FDA De Novo pathway",
      ],
    },
    {
      subject: "Mental health accessibility through digital platforms",
      description:
        "Explore digital solutions to improve access to mental health services, reduce stigma, and provide evidence-based interventions.",
      expectedAngles: ["health-equity", "digital-health", "patient-safety", "regulatory-pathway"],
      sampleInsights: [
        "Digital CBT platform with culturally adapted content for diverse populations",
        "AI-powered crisis detection in digital health apps with real-time safety protocols",
        "Measurement-based care tools integrating PHQ-9 and GAD-7 into telehealth workflows",
        "Digital therapeutics for substance use disorders with FDA breakthrough device designation",
      ],
    },
  ],

  biomimicrySubset: [
    "Immune system adaptive response — self-healing and threat detection patterns",
    "Neural network signal propagation — efficient information routing",
    "Wound healing cascade — staged recovery and regeneration processes",
    "Symbiotic microbiome relationships — ecosystem balance and health",
    "Circadian rhythm optimization — natural timing and recovery cycles",
    "Herd immunity threshold dynamics — population-level protection patterns",
    "Cell membrane selective permeability — intelligent filtering and access control",
    "Bone remodeling under stress — adaptive strengthening through use",
  ],

  metadata: {
    tags: [
      "healthcare",
      "healthtech",
      "digital-health",
      "medtech",
      "life-sciences",
      "clinical",
      "HIPAA",
      "FDA",
      "patient-safety",
      "telehealth",
    ],
    icon: "🏥",
    color: "#0EA5E9",
  },
};
