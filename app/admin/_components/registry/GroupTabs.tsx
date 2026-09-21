"use client";

/** Group tab row for the registry editor (home | company | rnd | …). */

export default function GroupTabs({
  groups,
  active,
  onSelect,
}: {
  groups: string[];
  active: string;
  onSelect: (group: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-line bg-white p-1">
      {groups.map((group) => {
        const isActive = group === active;
        return (
          <button
            key={group}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(group)}
            className={`rounded px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
              isActive ? "bg-accent text-white" : "text-[#6b7280] hover:text-accent"
            }`}
          >
            {group}
          </button>
        );
      })}
    </div>
  );
}
