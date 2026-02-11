/**
 * Parses assistant content that may contain <think>...</think> blocks.
 * Used when "thinking" is enabled: response is shown, think content is hidden/expandable.
 */

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

export interface ParseThinkResult {
  /** Text outside any think tags (the visible reply). */
  response: string;
  /** Contents of each <think>...</think> block, in order. */
  thinkingParts: string[];
  /** True if the string ends with an unclosed <think> (streaming inside a think block). */
  isInsideThink: boolean;
}

export function parseThinkContent(raw: string): ParseThinkResult {
  const thinkingParts: string[] = [];
  let response = "";
  let i = 0;
  let currentThink = "";

  while (i < raw.length) {
    if (raw.slice(i, i + THINK_OPEN.length) === THINK_OPEN) {
      i += THINK_OPEN.length;
      const closeIdx = raw.indexOf(THINK_CLOSE, i);
      if (closeIdx === -1) {
        currentThink = raw.slice(i);
        i = raw.length;
        break;
      }
      currentThink += raw.slice(i, closeIdx);
      thinkingParts.push(currentThink);
      currentThink = "";
      i = closeIdx + THINK_CLOSE.length;
      continue;
    }

    const nextOpen = raw.indexOf(THINK_OPEN, i);
    if (nextOpen === -1) {
      response += raw.slice(i);
      i = raw.length;
      break;
    }
    response += raw.slice(i, nextOpen);
    i = nextOpen;
  }

  if (currentThink.length > 0) {
    thinkingParts.push(currentThink);
  }
  const lastOpen = raw.lastIndexOf(THINK_OPEN);
  const lastClose = raw.lastIndexOf(THINK_CLOSE);
  const isInsideThink =
    lastOpen !== -1 && (lastClose === -1 || lastOpen > lastClose);

  return {
    response: response.trim(),
    thinkingParts,
    isInsideThink,
  };
}
