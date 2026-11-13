import { Button } from "@heroui/react";
import { FileTree } from "@heroui-pro/react/file-tree";
import type { Action, PresetFeatureGrant } from "@smart-sport/contracts";
import { useState } from "react";
import { GrantRow } from "../grant-row/GrantRow";
import { MenuGrantRow } from "../menu-grant-row/MenuGrantRow";
import {
  applyMenuGrant,
  configurationGroups,
  declaredActions,
  type PermissionRole,
  type PermissionValues,
} from "../permission-state";
import "./GrantTree.css";

export function GrantTree({
  role,
  values,
  disabled,
  canReset,
  onChange,
  onReset,
  canGrant,
  showPresets = true,
}: {
  role: PermissionRole;
  values: PermissionValues;
  disabled: boolean;
  canReset: boolean;
  onChange: (grants: PresetFeatureGrant[]) => void;
  onReset: (feature: { app: string; feature: string }, name: string) => void;
  canGrant?:
    | ((app: string, feature: string, action: Action) => boolean)
    | undefined;
  showPresets?: boolean;
}) {
  const groups = configurationGroups(role);
  const [expanded, setExpanded] = useState(
    new Set(["base:organization", "base:school"]),
  );
  const displayedFeatures = new Set(
    groups.flatMap((group) =>
      group.items.flatMap((item) =>
        item.features.map((feature) => `${feature.app}:${feature.feature}`),
      ),
    ),
  );
  return (
    <section className="template-grant-matrix">
      <div className="template-grant-heading">
        <h2>第 3 步 · 能做什么</h2>
        {showPresets && (
          <div className="template-grant-presets">
            <span>一键设置</span>
            {(
              [
                ["view", "全部只读"],
                ["edit", "日常操作"],
                ["manage", "全部管理"],
              ] as const
            ).map(([level, label]) => (
              <Button
                key={level}
                variant="secondary"
                size="sm"
                isDisabled={disabled}
                onPress={() =>
                  onChange(
                    values.grants.map((entry) =>
                      displayedFeatures.has(`${entry.app}:${entry.feature}`)
                        ? { ...entry, grant: { level } }
                        : entry,
                    ),
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <FileTree
        aria-label="菜单权限配置"
        className="template-grant-tree"
        selectionMode="none"
        showGuideLines={false}
        expandedKeys={expanded}
        onExpandedChange={(keys) => setExpanded(new Set([...keys].map(String)))}
      >
        {groups.map((group) => (
          <FileTree.Item
            key={group.key}
            id={group.key}
            title={group.name}
            textValue={group.name}
            className="template-grant-group"
          >
            {group.items.map((item, index) => (
              <FileTree.Item
                key={item.key}
                id={`${group.key}:${item.key}`}
                textValue={item.name}
                className={[
                  index === 0 ? "template-grant-first" : "",
                  index === group.items.length - 1 &&
                  !(
                    item.key === "classes" &&
                    expanded.has(`${group.key}:${item.key}`)
                  )
                    ? "template-grant-last"
                    : "",
                ].join(" ")}
                title={
                  <MenuGrantRow
                    item={item}
                    values={values}
                    disabled={disabled}
                    canReset={canReset}
                    onChange={onChange}
                    onReset={onReset}
                    canGrant={canGrant}
                  />
                }
              >
                {item.key === "classes" &&
                  item.features.map((feature, featureIndex) => (
                    <FileTree.Item
                      key={`${feature.app}:${feature.feature}`}
                      id={`${group.key}:${item.key}:${feature.app}:${feature.feature}`}
                      textValue={feature.featureName}
                      className={
                        index === group.items.length - 1 &&
                        featureIndex === item.features.length - 1
                          ? "template-grant-last"
                          : ""
                      }
                      title={
                        <GrantRow
                          feature={feature}
                          grant={
                            values.grants.find(
                              (entry) =>
                                entry.app === feature.app &&
                                entry.feature === feature.feature,
                            )?.grant ?? { level: "none" }
                          }
                          disabled={disabled}
                          canReset={canReset}
                          grantableActions={
                            canGrant
                              ? declaredActions(
                                  feature.app,
                                  feature.feature,
                                ).filter((action) =>
                                  canGrant(
                                    feature.app,
                                    feature.feature,
                                    action,
                                  ),
                                )
                              : undefined
                          }
                          onChange={(grant) =>
                            onChange(applyMenuGrant(values, [feature], grant))
                          }
                          onReset={() => onReset(feature, feature.featureName)}
                        />
                      }
                    />
                  ))}
              </FileTree.Item>
            ))}
          </FileTree.Item>
        ))}
      </FileTree>
      <p className="template-grant-help">
        勾选菜单旁的按钮权限即可授权；分组标题右侧的箭头可展开或收起菜单。
        {groups.some((group) =>
          group.items.some((item) => item.key === "colleges"),
        ) && "院系专业独立配置，仅适用于大学；班级管理包含行政班和教学班。"}
      </p>
    </section>
  );
}
