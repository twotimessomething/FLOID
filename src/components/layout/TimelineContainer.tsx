import Timeline from '../timeline/Timeline';

export default function TimelineContainer() {
  return (
    <div className="flex-1 min-w-0 p-4 bg-[#fafafa]">
      <div className="h-full rounded-[10px] border border-[#e5e7eb] bg-white overflow-hidden shadow-sm">
        <Timeline />
      </div>
    </div>
  );
}
