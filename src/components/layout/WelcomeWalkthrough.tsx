import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { addMonths } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { DrawLesson } from './walkthrough/DrawLesson';
import { GroupLesson } from './walkthrough/GroupLesson';
import { TaskLesson } from './walkthrough/TaskLesson';
import { ProjectAsk } from './walkthrough/ProjectAsk';
import { TemplateAsk } from './walkthrough/TemplateAsk';

/**
 * First run.
 *
 * Five screens, each a single thing to do, and nothing to read past the line at
 * the top. Three of them teach what cannot be found by looking — drawing a bar
 * on empty paper, dropping a bar on a bar to group it, and the context menu
 * with the circle that ticks — and two of them ask the only two things the
 * product cannot start without. Everything else the app can do either
 * announces itself on hover or simply happens to the person the first time
 * they meet it, and the product can say what it is then, in place, rather than
 * here, in advance.
 *
 * What is not here is the point. Schedules, moving, resizing, links, the
 * context menu, the export formats: all true, all previously a card with a
 * figure on it, all cut, because none of them was something to do.
 *
 * The person lands on their own timeline, not on a form.
 */

/** Twelve months from the first of this month — the same default the modal uses. */
function defaultWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: addMonths(start, 12) };
}

type Step = 'draw' | 'group' | 'task' | 'project' | 'template';

const ORDER: readonly Step[] = ['draw', 'group', 'task', 'project', 'template'];

export function WelcomeWalkthrough(): ReactElement | null {
  const isProjectSetupModalOpen = useUIStore((state) => state.isProjectSetupModalOpen);
  const closeModal = useUIStore((state) => state.closeModal);
  const createProject = useProjectStore((state) => state.createProject);
  const selectProject = useProjectStore((state) => state.selectProject);
  const setSections = useSectionStore((state) => state.setSections);
  const setDependencies = useSectionStore((state) => state.setDependencies);

  const initialWindow = useMemo(defaultWindow, []);
  const [step, setStep] = useState<Step>('draw');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(initialWindow.start);
  const [endDate, setEndDate] = useState(initialWindow.end);
  const [templateId, setTemplateId] = useState('blank');
  const [isStarting, setIsStarting] = useState(false);

  const goNext = useCallback((): void => {
    setStep((current) => ORDER[Math.min(ORDER.indexOf(current) + 1, ORDER.length - 1)]);
  }, []);

  const goBack = useCallback((): void => {
    setStep((current) => ORDER[Math.max(ORDER.indexOf(current) - 1, 0)]);
  }, []);

  /** An end before its start would make a sheet with no days on it. */
  const handleStartDateChange = useCallback((date: Date): void => {
    setStartDate(date);
    setEndDate((current) => (current > date ? current : addMonths(date, 12)));
  }, []);

  const handleStart = useCallback(async (): Promise<void> => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const { projectId, sections } = await createProject({
        name: name.trim() || 'New Project',
        startDate,
        endDate,
        templateId,
      });
      closeModal();
      await selectProject(projectId);
      setSections(sections);
      setDependencies([]);
    } catch (error) {
      console.error('Failed to create project:', error);
      setIsStarting(false);
    }
  }, [
    isStarting,
    name,
    startDate,
    endDate,
    templateId,
    createProject,
    closeModal,
    selectProject,
    setSections,
    setDependencies,
  ]);

  // The New Project modal is still reachable from the sidebar, and the two
  // must not stack: this screen stands down while it is open.
  if (isProjectSetupModalOpen) return null;

  return (
    <div
      className="h-full flex items-center justify-center bg-[var(--color-background)] px-6 overflow-y-auto"
      role="region"
      aria-label="Getting started"
    >
      {step === 'draw' && <DrawLesson onDone={goNext} />}
      {step === 'group' && <GroupLesson onDone={goNext} />}
      {step === 'task' && <TaskLesson onDone={goNext} />}
      {step === 'project' && (
        <ProjectAsk
          name={name}
          onNameChange={setName}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={setEndDate}
          onDone={goNext}
        />
      )}
      {step === 'template' && (
        <TemplateAsk
          templateId={templateId}
          onTemplateChange={setTemplateId}
          startDate={startDate}
          endDate={endDate}
          onStart={handleStart}
          isStarting={isStarting}
          onBack={goBack}
        />
      )}
    </div>
  );
}
