import { useEffect } from "react";

/** 将草稿状态告知外层，切换角色前可确认是否放弃。 */
export function EditorDraftState({
  dirty,
  onDirty,
}: {
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  return null;
}
