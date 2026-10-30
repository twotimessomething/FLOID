import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import { buildAuthoringPrompt } from '../data/authoringSpec';
import { copyText } from '../utils/clipboard';
import { importAuthoredText } from '../utils/importFloid';
import { lastDayOf, todayKey } from '../utils/dayKeys';
import { forEachItem, sectionExtent } from '../utils/itemTree';
import type { PromptItem } from '../data/authoringSpec';
import type { Section } from '../types/timeline';

/** How long a copy button says "Copied" before it reads as itself again. */
const COPIED_MS = 2000;

type Copied = 'instructions' | 'problems' | null;

/** A schedule's items as the AI is told about them, inclusive dates and all. */
function promptItems(section: Section): PromptItem[] {
  const items: PromptItem[] = [];
  forEachItem(section.items, (item, _parent, depth) => {
    const end = item.kind === 'bar' ? lastDayOf(item.end) : item.start;
    items.push({ name: item.name, kind: item.kind, start: item.start, end, depth });
  });
  return items;
}

interface UseBuildWithAIReturn {
  readonly reply: string;
  readonly setReply: (reply: string) => void;
  readonly errors: readonly string[];
  readonly copied: Copied;
  readonly isImporting: boolean;
  readonly copyInstructions: () => Promise<void>;
  readonly copyProblems: () => Promise<void>;
  /** Resolves true once the schedules are on the sheet. */
  readonly submit: () => Promise<boolean>;
  readonly reset: () => void;
}

/**
 * The round trip with someone else's AI: instructions out on the clipboard,
 * the reply back in through the same door a `.floid` file uses. When the reply
 * does not read, the problems go back out on the clipboard too, worded for the
 * AI to fix — the person in the middle only carries text between two windows.
 */
export function useBuildWithAI(): UseBuildWithAIReturn {
  const [reply, setReplyState] = useState('');
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [copied, setCopied] = useState<Copied>(null);
  const [isImporting, setIsImporting] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const flagCopied = useCallback((what: Copied) => {
    window.clearTimeout(copiedTimer.current);
    setCopied(what);
    copiedTimer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  }, []);

  const copyInstructions = useCallback(async () => {
    // Read at the moment of copying, so the AI hears about the sheet as it is
    const { project } = useProjectStore.getState();
    const { sections } = useSectionStore.getState();
    const prompt = buildAuthoringPrompt({
      today: todayKey(),
      project: project
        ? {
            name: project.name,
            schedules: sections.map((section) => {
              const extent = sectionExtent(section);
              return {
                name: section.name,
                start: extent.start,
                end: lastDayOf(extent.end),
                items: promptItems(section),
              };
            }),
          }
        : undefined,
    });
    if (await copyText(prompt)) flagCopied('instructions');
  }, [flagCopied]);

  const copyProblems = useCallback(async () => {
    const message = [
      'FLOID couldn’t import that document. Please fix these problems and send the whole document again:',
      ...errors.map((error) => `- ${error}`),
    ].join('\n');
    if (await copyText(message)) flagCopied('problems');
  }, [errors, flagCopied]);

  const setReply = useCallback((next: string) => {
    setReplyState(next);
    // A stale list under a changed reply would be describing something else
    setErrors([]);
  }, []);

  const submit = useCallback(async () => {
    setIsImporting(true);
    try {
      const result = await importAuthoredText(reply);
      if (result.ok) return true;
      setErrors(result.errors);
      return false;
    } finally {
      setIsImporting(false);
    }
  }, [reply]);

  const reset = useCallback(() => {
    setReplyState('');
    setErrors([]);
  }, []);

  return {
    reply,
    setReply,
    errors,
    copied,
    isImporting,
    copyInstructions,
    copyProblems,
    submit,
    reset,
  };
}
