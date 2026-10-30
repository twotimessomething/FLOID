import { useCallback } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useBuildWithAI } from '../../hooks/useBuildWithAI';
import { usePresence } from '../../hooks/usePresence';
import { useModalLayer } from '../../hooks/useModalLayer';
import { Button } from '../common/Button';

/**
 * Two steps, read top to bottom: take the instructions to an AI, bring its
 * answer back. No AI is built in and none is chosen for anyone — whatever
 * chat someone already uses does the writing, and FLOID only reads.
 */
export function BuildWithAIModal(): JSX.Element | null {
  const isOpen = useUIStore((state) => state.isBuildWithAIModalOpen);
  const close = useUIStore((state) => state.closeBuildWithAIModal);
  const hasProject = useProjectStore((state) => state.project !== null);
  const {
    reply,
    setReply,
    errors,
    copied,
    isImporting,
    copyInstructions,
    copyProblems,
    submit,
    reset,
  } = useBuildWithAI();

  const handleReplyChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setReply(event.target.value),
    [setReply]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (await submit()) {
        reset();
        close();
      }
    },
    [submit, reset, close]
  );

  const { isMounted, isLeaving } = usePresence(isOpen);
  const { panelRef, backdropProps } = useModalLayer({ isOpen, isMounted, onDismiss: close });
  if (!isMounted) return null;

  const canSubmit = reply.trim().length > 0 && !isImporting;

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      {...backdropProps}
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-with-ai-title"
    >
      <div className="absolute inset-0 bg-[var(--color-scrim)] pointer-events-none" />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-lg mx-4 outline-none modal-enter"
        role="document"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between px-6 py-4">
            <h2
              className="text-title font-medium text-[var(--color-text-primary)]"
              id="build-with-ai-title"
            >
              Build with AI
            </h2>
            <button
              type="button"
              onClick={close}
              className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-hover)] focus-ring btn-press"
              aria-label="Close (Escape)"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="px-6 pb-6 flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <p className="text-body text-[var(--color-text-secondary)]">
                Copy these instructions into ChatGPT, Claude or any AI chat. Then describe the
                schedule you want, or paste one exported from another app.
              </p>
              <div>
                <Button type="button" onClick={copyInstructions}>
                  {copied === 'instructions' ? 'Copied' : 'Copy Instructions'}
                </Button>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <label
                htmlFor="build-with-ai-reply"
                className="text-body text-[var(--color-text-secondary)]"
              >
                Paste the AI’s reply here.
              </label>
              <textarea
                id="build-with-ai-reply"
                value={reply}
                onChange={handleReplyChange}
                rows={7}
                spellCheck={false}
                placeholder='{ "format": "floid-authoring", … }'
                className="px-2 py-1.5 text-meta font-mono bg-[var(--color-input-bg)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-[var(--radius-sm)] transition-colors duration-fast focus:outline-none focus:border-[var(--color-focus)] resize-none"
              />
              {errors.length > 0 && (
                <div role="alert" className="flex flex-col gap-2">
                  <ul className="text-meta text-[var(--color-error)] flex flex-col gap-1 max-h-32 overflow-y-auto">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                  <div>
                    <Button type="button" variant="ghost" size="sm" onClick={copyProblems}>
                      {copied === 'problems' ? 'Copied' : 'Copy Problems for the AI'}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canSubmit}>
                {hasProject ? 'Add to Project' : 'Create Project'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
