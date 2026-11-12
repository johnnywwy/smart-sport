import { FileTree } from "@heroui-pro/react/file-tree";
import type { ReactElement } from "react";
import type { PermissionPreviewNode } from "../../preview-tree";
import "./PreviewMenuTree.css";

function renderNode(node: PermissionPreviewNode): ReactElement {
  return (
    <FileTree.Item
      key={node.key}
      id={node.key}
      title={node.name}
      textValue={node.name}
    >
      {node.children.map(renderNode)}
    </FileTree.Item>
  );
}

export function PreviewMenuTree({ nodes }: { nodes: PermissionPreviewNode[] }) {
  if (!nodes.length) return <p>当前配置没有可见菜单。</p>;
  return (
    <FileTree
      aria-label="实时菜单权限预览"
      className="template-preview-tree"
      selectionMode="none"
      showGuideLines={false}
      size="sm"
      defaultExpandedKeys={nodes.map((node) => node.key)}
    >
      {nodes.map(renderNode)}
    </FileTree>
  );
}
