import type { Page } from "@playwright/test";
import { BOARD, BOARD_COVERS, BOARD_PARTS, BOARD_TEXT } from "@/lib/board-parts";

/**
 * Every line of words on the opened board, measured in pixels of the board
 * image: each must lie on its own card, clear of whatever is pinned over that
 * card (the kraft note, pins, pegs), and of the note's corner on the hours card.
 * Returns what is out of place; empty when the board reads cleanly.
 */
export async function boardLayoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ board, cards, covers, text }) => {
      const el = document.querySelector<HTMLElement>(".notice-board");
      if (!el) return ["no board"];
      const frame = el.getBoundingClientRect();
      const k = board.width / frame.width;
      const toBoard = (r: DOMRect) => ({ x: (r.left - frame.left) * k, y: (r.top - frame.top) * k, w: r.width * k, h: r.height * k });
      const lines: { card: string; r: { x: number; y: number; w: number; h: number }; text: string }[] = [];
      for (const card of el.querySelectorAll<HTMLElement>("[data-card]")) {
        const id = card.dataset.card!;
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent?.trim()) continue;
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) lines.push({ card: id, r: toBoard(r), text: node.textContent.trim().slice(0, 24) });
        }
      }
      const problems: string[] = [];
      const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      // A glyph's box runs a little past its ink; a couple of board px either way is still on the paper.
      const slack = 3;
      for (const { card, r, text: words } of lines) {
        const paper = cards[card as keyof typeof cards];
        if (r.x < paper.x - slack || r.y < paper.y - slack || r.x + r.w > paper.x + paper.w + slack || r.y + r.h > paper.y + paper.h + slack)
          problems.push(`${card}: "${words}" runs off the card`);
        for (const [name, cover] of Object.entries(covers)) {
          if (!(cover.over as readonly string[]).includes(card)) continue;
          const inner = { x: r.x + slack, y: r.y + slack, w: r.w - 2 * slack, h: r.h - 2 * slack };
          if (overlap(inner, cover)) problems.push(`${card}: "${words}" runs under the ${name}`);
        }
        if (card === "hours") {
          const { notch } = text.hours;
          if (r.x + r.w - slack > notch.x && r.y + r.h - slack > notch.y) problems.push(`hours: "${words}" runs into the note's corner`);
        }
      }
      return [...new Set(problems)];
    },
    { board: BOARD, cards: BOARD_PARTS.cards, covers: BOARD_COVERS, text: BOARD_TEXT },
  );
}
