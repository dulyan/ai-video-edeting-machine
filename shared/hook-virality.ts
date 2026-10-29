export const DEFAULT_HOOK_VIRALITY = 1;
export const VIRALITY_GUIDANCE = [
  "Neutral and product-focused: clearly describe supplied product facts, audience need, pain point, cost of inaction, solution, or proof. No hype or manufactured suspense.",
  "Product-focused with a gentle engaging question or clear benefit, still neutral and factual.",
  "Lead with a specific audience problem, then connect it clearly to the product's supplied purpose.",
  "Problem-first and more engaging: leave one relevant question open while keeping a clear connection to the product.",
  "Balance product relevance with a wider industry problem. Create a specific knowledge gap without giving away the full solution.",
  "Industry-led: explore a relevant habit, tradeoff, or unanswered question. The product is the eventual answer rather than the headline.",
  "Strong industry curiosity: make a familiar problem feel worth investigating, with a clear unanswered question and little brand emphasis.",
  "High curiosity: frame a specific industry puzzle, overlooked choice, or unexpected question that the following product demo can credibly answer.",
  "Very high curiosity: a surprising, industry-first open loop with concrete stakes and an answer withheld until the following content. Avoid product feature lists.",
  "Maximum curiosity, industry-first: the completed hook should leave a specific, compelling unanswered question that makes the viewer want the next moment. Focus on the industry's real audience problem or a plausible unresolved choice, not the product name or feature list. The following product content must be able to deliver the implied answer.",
] as const;
export function viralityGuidance(level=DEFAULT_HOOK_VIRALITY) {
  return VIRALITY_GUIDANCE[Math.min(10,Math.max(1,Math.round(level)))-1];
}
export function hookWritingSystem(level:number) {
  return `Write varied short-form video text hooks in the requested language. Virality level: ${level}/10. ${viralityGuidance(level)}\nUse the supplied product description, public external name, pain points, cost of inaction, solution and proof as grounding. Infer the industry only from this context; when ambiguous, stay with the stated audience problem. Higher levels broaden the framing toward that industry, not toward unrelated subjects. At level 1 write direct neutral hooks grounded in the product facts; as levels rise, increase curiosity and reduce explicit product/brand emphasis. At level 10 normally omit the brand and do not reveal the answer in the hook. Vary the mechanism of curiosity across the batch instead of rephrasing one template.\nNever invent statistics, endorsements, studies, expert authority, guarantees, results, urgency, scandals or proof. Do not assert an unproven industry claim as fact, use deceptive clickbait, or promise an answer the product cannot deliver. Avoid generic 'wait for it' filler. Keep each hook readable as one short sentence or two tight clauses (usually 6-18 words in space-separated languages). Use the public external product name when a name is appropriate, not the internal campaign name. Return exactly JSON {"hooks":[strings]}. Do not duplicate hooks in avoid.`;
}
