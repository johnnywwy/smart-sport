import "./SemesterSummary.css";

export function SemesterSummary({
  semesters,
}: {
  semesters: readonly { name: string; startDate: string; endDate: string }[];
}) {
  return (
    <dl className="academic-semester-summary">
      {semesters.map((semester) => (
        <div key={semester.name}>
          <dt>{semester.name}</dt>
          <dd>
            <time>{semester.startDate}</time>
            <span>至</span>
            <time>{semester.endDate}</time>
          </dd>
        </div>
      ))}
    </dl>
  );
}
