import Timeline from '../timeline/Timeline';

export default function TimelineContainer() {
  return (
    <div className="flex-1 min-w-0 p-4 bg-gray-100">
      <div className="h-full rounded-lg border border-gray-300 bg-white overflow-hidden shadow-sm">
        <Timeline />
      </div>
    </div>
  );
}
