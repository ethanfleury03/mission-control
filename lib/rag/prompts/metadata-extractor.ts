export const METADATA_EXTRACTOR_PROMPT = `You classify Arrow Systems support documents.

Input is a filename and the first pages of extracted text. Return strict JSON only:
{
  "title": "",
  "product_family": "DuraFlex | DuraCore | DuraBolt | Dura-Printer | AnyJet | Cutter | RIP | General",
  "product_model": "",
  "document_type": "installation_guide | user_manual | troubleshooting_guide | service_procedure | software_release_notes | spare_parts | technical_bulletin | databook | system_requirements | print_quality | connectivity | job_submission | unknown",
  "version": "",
  "software_version": "",
  "revision_date": "YYYY-MM-DD or null",
  "confidence": 0.0,
  "product_family_confidence": 0.0,
  "document_type_confidence": 0.0,
  "version_confidence": 0.0,
  "revision_date_confidence": 0.0,
  "signals": []
}

Normalize product names. Examples: Arrow Any-002 maps to AnyJet; EZCut and VR series map to Cutter; MCS maps to Dura-Printer. Prefer explicit revision or release dates from the document over filename guesses.`;
