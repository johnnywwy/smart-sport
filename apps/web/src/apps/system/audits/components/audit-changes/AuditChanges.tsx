import { auditChangeRows } from "../../audit-changes";
import "./AuditChanges.css";
export function AuditChanges({ changes }: { changes: unknown }) {
  const rows = auditChangeRows(changes);
  return (
    <section className="audit-changes" aria-label="变更内容">
      <h3>变更内容</h3>
      {rows.length ? (
        <dl>
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {"before" in row ? (
                  <>
                    <span className="audit-before">{row.before}</span>
                    <span
                      role="img"
                      aria-label="修改为"
                      className="audit-change-arrow"
                    >
                      →
                    </span>
                    <span>{row.after}</span>
                  </>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>此记录未包含可展示的字段变更。</p>
      )}
    </section>
  );
}
