export const KNOWLEDGE_KEYS = [
  "royalty",
  "isbn",
  "printing",
  "distribution",
  "production",
  "general",
] as const;

export type KnowledgeKey = (typeof KNOWLEDGE_KEYS)[number];

export const knowledgeBase: Record<KnowledgeKey, string> = {
  general: `BookLeaf Publishing is a self-publishing company in India and the US. Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (paid, with marketing and distribution add-ons). BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution, and royalty management. In-house printing and the warehouse are in Delhi. Print partners include Repro India and Epitome Books.

Tone: empathetic and professional. Authors are partners. Acknowledge the concern before the solution. Use a number, date, or status only when it is in the facts block. If the issue is BookLeaf's fault and the facts say so, own it. If work is still required, give the timeline from the matching policy, not an open-ended promise. End with a concrete next step. Do not deflect.

Metadata updates can be requested through the team. They typically show on platforms within 3–5 business days.`,
  royalty: `Royalty split is 80/20 on net profit, not on MRP. The author receives 80% of net profit. Net profit is MRP minus printing cost, platform commission (Amazon or Flipkart), and shipping. Royalties are calculated quarterly and paid within 45 days of the quarter ending. Minimum payout is ₹1,000. Below that, the balance rolls to the next quarter. Payouts are a bank transfer to the account linked in the author's dashboard. A detailed breakdown is per platform, but this app only has the imported book totals. Do not invent a line-by-line breakdown that is not in the facts. If a payment looks overdue against the quarterly rule and the facts do not already prove a date, say the team will check and reply within 48 hours.`,
  isbn: `Every BookLeaf book gets a unique ISBN assigned by BookLeaf, registered under BookLeaf's imprint. An ISBN under the author's own imprint must be obtained by the author. A reported ISBN error (duplicate, or a different ISBN on a store than on the physical copy) is high priority and is escalated to the production team with a 48-hour update timeline.`,
  printing: `In-house printing handles most orders. Overflow or special formats go to Repro India or Epitome Books. Standard turnaround is 5–7 business days from order confirmation. For a quality complaint (misprint, binding, color, blur, misalignment), apologize, ask for photos of the defective copy, and say BookLeaf arranges a free reprint after verification. Reprint timing after verification is 5–7 business days.`,
  distribution: `Listings go to Amazon India, Flipkart, Amazon US, Amazon UK, and the BookLeaf Store. A new listing typically goes live 7–10 business days after publication is complete. "Currently unavailable" is usually a stock sync issue. The team can trigger a re-sync; expect 24–48 hours. Do not say a re-sync has already been triggered unless the facts say it has. This app does not trigger one.`,
  production: `Stages, in order: Manuscript Received, Editing (if opted), Cover Design, Typesetting, Proofreading, ISBN Assignment, Printing, Distribution Setup, Published & Live. Authors are updated by email at each stage. Delays usually happen at Cover Design (waiting for author approval) and Proofreading (revision rounds). If the stored status is still an in-production value, say that status. If the facts do not explain the delay, say the team will confirm a revised timeline within 48 hours. Do not blame the author. Frame approval waits as a shared next step.`,
};
