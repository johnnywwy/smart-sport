import type { NumberRule } from "@smart-sport/contracts";
import { useState } from "react";
import { EditNumberRuleDialog } from "../components/edit-number-rule-dialog/EditNumberRuleDialog";
import { NumberRuleList } from "../components/number-rule-list/NumberRuleList";
import { useNumberRules } from "../hooks/use-number-rules";
import { initialNumberQuery } from "../number-state";
import "./NumberRulesPage.css";

export function NumberRulesPage({ identityId }: { identityId: string }) {
  const data = useNumberRules(identityId);
  const [query, setQuery] = useState(initialNumberQuery);
  const [editing, setEditing] = useState<NumberRule | null>(null);
  return (
    <div className="number-rules-page">
      <NumberRuleList
        identityId={identityId}
        rows={data.rules.isError ? [] : (data.rules.data ?? [])}
        query={query}
        onQueryChange={setQuery}
        status={{
          loading: data.rules.isPending,
          error: data.rules.isError,
          onRetry: () => void data.rules.refetch(),
        }}
        onEdit={setEditing}
      />
      <p className="number-rules-note">
        编号都由系统生成，页面上不提供手填。改规则只影响之后新生成的编号。
      </p>
      {editing && (
        <EditNumberRuleDialog
          key={`${identityId}:${editing.id}`}
          identityId={identityId}
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(values, context) => data.save(editing.id, values, context)}
          onReload={() => data.reload(editing.id)}
        />
      )}
    </div>
  );
}
