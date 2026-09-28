/**
 * Markdown-aware text chunker.
 *
 * Respects markdown headers (#, ##, ###), maintains header context,
 * clamps chunk sizes by estimated token count (~400 tokens),
 * and provides sliding overlap between adjacent chunks within a section.
 */

export interface MarkdownChunk {
  index: number;
  text: string;
  headerPath: string;
  tokenCount: number;
}

export interface ChunkerOptions {
  /** Maximum target tokens per chunk. Defaults to 400 (~1600 characters). */
  maxTokens?: number;
  /** Number of overlapping tokens between adjacent split chunks within a section. Defaults to 50. */
  overlapTokens?: number;
}

/**
 * Approximate token count for English/technical text (~4 characters per token or whitespace/word count).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(Math.ceil(text.length / 4), Math.ceil(words * 1.3));
}

interface Section {
  headerPath: string;
  headerText: string;
  bodyParagraphs: string[];
}

/**
 * Parses markdown into logical sections based on #, ##, ### headings.
 */
function parseSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];

  let currentHeaderPath = "General";
  let currentHeaderText = "";
  let currentParagraphs: string[] = [];
  const headerStack: { level: number; title: string }[] = [];

  const flush = () => {
    const fullBody = currentParagraphs.join("\n\n").trim();
    if (fullBody || currentHeaderText) {
      sections.push({
        headerPath: currentHeaderPath,
        headerText: currentHeaderText,
        bodyParagraphs: [...currentParagraphs]
      });
    }
    currentParagraphs = [];
  };

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flush();
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      // Pop headers of equal or deeper level
      while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
        headerStack.pop();
      }
      headerStack.push({ level, title });

      currentHeaderPath = headerStack.map((h) => h.title).join(" > ");
      currentHeaderText = line.trim();
    } else {
      if (line.trim().length > 0) {
        currentParagraphs.push(line.trim());
      }
    }
  }

  flush();
  return sections;
}

/**
 * Splits a section's text into chunks respecting max token count and overlap.
 */
function chunkSection(
  section: Section,
  startIndex: number,
  options: Required<ChunkerOptions>
): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = [];
  const contextPrefix = section.headerPath ? `[${section.headerPath}]\n` : "";
  const baseHeader = section.headerText ? `${section.headerText}\n\n` : "";

  // Combine section content
  const fullSectionText = section.bodyParagraphs.join("\n\n").trim();
  if (!fullSectionText && !section.headerText) return [];

  const rawSection = baseHeader + fullSectionText;
  const sectionTokens = estimateTokens(rawSection);

  // If section fits in one chunk, return it
  if (sectionTokens <= options.maxTokens) {
    chunks.push({
      index: startIndex,
      text: (contextPrefix + rawSection).trim(),
      headerPath: section.headerPath,
      tokenCount: estimateTokens((contextPrefix + rawSection).trim())
    });
    return chunks;
  }

  // Flatten paragraphs, splitting oversized paragraphs into sentences if needed
  const items: string[] = [];
  for (const p of section.bodyParagraphs) {
    if (estimateTokens(p) > options.maxTokens) {
      // Split by sentence boundary
      const sentences = p.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [p];
      items.push(...sentences.map((s) => s.trim()).filter(Boolean));
    } else {
      items.push(p);
    }
  }

  let currentChunkParts: string[] = [];
  let currentTokens = estimateTokens(baseHeader);

  let localIndex = startIndex;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemTokens = estimateTokens(item);

    if (currentTokens + itemTokens > options.maxTokens && currentChunkParts.length > 0) {
      const chunkBody = (baseHeader + currentChunkParts.join(" ")).trim();
      chunks.push({
        index: localIndex++,
        text: (contextPrefix + chunkBody).trim(),
        headerPath: section.headerPath,
        tokenCount: estimateTokens((contextPrefix + chunkBody).trim())
      });

      // Compute overlap from the end of currentChunkParts
      const overlapParts: string[] = [];
      let overlapCount = 0;
      for (let j = currentChunkParts.length - 1; j >= 0; j--) {
        const t = estimateTokens(currentChunkParts[j]);
        if (overlapCount + t <= options.overlapTokens) {
          overlapParts.unshift(currentChunkParts[j]);
          overlapCount += t;
        } else {
          break;
        }
      }

      currentChunkParts = [...overlapParts, item];
      currentTokens = estimateTokens(baseHeader) + overlapCount + itemTokens;
    } else {
      currentChunkParts.push(item);
      currentTokens += itemTokens;
    }
  }

  if (currentChunkParts.length > 0) {
    const chunkBody = (baseHeader + currentChunkParts.join(" ")).trim();
    chunks.push({
      index: localIndex++,
      text: (contextPrefix + chunkBody).trim(),
      headerPath: section.headerPath,
      tokenCount: estimateTokens((contextPrefix + chunkBody).trim())
    });
  }

  return chunks;
}

/**
 * Chunks a markdown string into header-aware, token-clamped segments.
 */
export function chunkMarkdown(
  markdown: string,
  options: ChunkerOptions = {}
): MarkdownChunk[] {
  const opts: Required<ChunkerOptions> = {
    maxTokens: options.maxTokens ?? 400,
    overlapTokens: options.overlapTokens ?? 50
  };

  const sections = parseSections(markdown);
  const chunks: MarkdownChunk[] = [];
  let currentIndex = 0;

  for (const sec of sections) {
    const secChunks = chunkSection(sec, currentIndex, opts);
    for (const c of secChunks) {
      chunks.push(c);
      currentIndex++;
    }
  }

  return chunks;
}
