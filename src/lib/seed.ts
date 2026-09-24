import type { SermonContent, SermonDocument } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";

/** Short sample sermon so /preach is never empty on first load. */
export const SEED_CONTENT: SermonContent = {
  type: "doc",
  content: [
    {
      type: "title",
      content: [{ type: "text", text: "Joy That Outlasts the Moment" }],
    },
    {
      type: "scripture",
      attrs: { citation: "Philippians 4:4–7 (ESV)" },
      content: [
        {
          type: "text",
          text: "Rejoice in the Lord always; again I will say, rejoice. Let your reasonableness be known to everyone. The Lord is at hand; do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God. And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "I. Rejoice is a command, not a mood" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Paul writes from prison, yet he repeats the call to rejoice. Christian joy is anchored in the Lord—who He is and what He has done—not in shifting circumstances.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Joy rooted in relationship" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "We rejoice “in the Lord.” The object of joy determines its durability. When Christ is the center, joy can coexist with sorrow without becoming denial.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "II. Gentleness under pressure" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "“Let your reasonableness be known to everyone.” A rejoicing heart produces a gentle presence—especially when anxiety would normally make us sharp.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "III. Prayer that trades anxiety for peace" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Instead of rehearsing worry, we present requests with thanksgiving. God’s peace then stands guard over heart and mind in Christ Jesus.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Practice: name it, pray it, thank Him" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This week: write one anxiety, pray it specifically, and thank God for one concrete mercy before you close.",
        },
      ],
    },
  ],
};

export function createSeedDocument(): SermonDocument {
  return {
    id: "seed-philippians-4",
    title: "Joy That Outlasts the Moment",
    updatedAt: new Date().toISOString(),
    content: SEED_CONTENT,
    presentationSettings: { ...DEFAULT_PRESENTATION_SETTINGS },
    notes:
      "Study notes stub — expand illustrations, cross-refs, and application questions here.",
  };
}
