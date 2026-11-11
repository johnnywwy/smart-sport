import { Chip } from "@heroui/react";
import { type ComponentProps, useId } from "react";
import { ApplicationCard } from "../application-card/ApplicationCard";

type ApplicationGridProps = {
  applications: readonly ComponentProps<typeof ApplicationCard>[];
};

export function ApplicationGrid({ applications }: ApplicationGridProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id={headingId} className="text-xl font-semibold">
          我的应用
        </h2>
        <Chip size="sm" variant="soft">
          {applications.length} 个规划应用
        </Chip>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {applications.map((app) => (
          <ApplicationCard key={app.name} {...app} />
        ))}
      </div>
    </section>
  );
}
