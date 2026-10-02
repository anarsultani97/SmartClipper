import { useMemo } from "react";

const commonWords = new Set(
  "about after again because before could first have other should their there these they think those through video videos would bunun burada gibi için sonra şimdi video həmin burada sonra bizim sizin deyil necə üçün qədər".split(
    " ",
  ),
);
const wordPattern = /(\p{L}[\p{L}\p{M}\p{N}'’\-]*)/u;

export function plainSummary(line: string): string {
  // Older clips have generated introductions around quoted speech.
  const match = line.match(
    /^The (?:excerpt opens with|speaker continues|excerpt closes with): [“"]([\s\S]*)[”"]\.?$/,
  );
  return match ? match[1] : line;
}

export function TranscriptText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const tokens = text.split(wordPattern);
    const counts = new Map<string, number>();
    for (let i = 1; i < tokens.length; i += 2) {
      const word = tokens[i].normalize("NFKC").toLowerCase();
      if (word.length >= 5 && !commonWords.has(word))
        counts.set(word, (counts.get(word) || 0) + 1);
    }
    const keywords = new Set(
      [...counts]
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([word]) => word),
    );
    return tokens.map((part, i) =>
      keywords.has(part.normalize("NFKC").toLowerCase()) ? (
        <mark key={i}>{part}</mark>
      ) : (
        part
      ),
    );
  }, [text]);
  return (
    <p className="plain-transcript" dir="auto">
      {parts}
    </p>
  );
}
