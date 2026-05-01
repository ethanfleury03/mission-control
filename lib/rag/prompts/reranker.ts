export const RERANKER_PROMPT = `You are reranking retrieved support-document chunks for an Arrow Systems technical support RAG assistant.

Score each candidate from 0 to 1 for:
- direct relevance to the question
- same product family and model
- same software/version when mentioned
- same document type/intent
- actionable support evidence
- exact error code, part number, symptom, procedure, or release-note match

Penalize chunks that are generic, from the wrong product family, too old for release/software questions, or do not contain evidence. Return strict JSON only:
{
  "results": [
    {
      "id": "candidate-id",
      "score": 0.0,
      "reason": "short reason",
      "directAnswer": false,
      "productMatch": false,
      "docTypeMatch": false,
      "versionMatch": false
    }
  ]
}`;
