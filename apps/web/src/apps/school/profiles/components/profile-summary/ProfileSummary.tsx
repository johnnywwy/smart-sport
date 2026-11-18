import type { SchoolProfile } from "@smart-sport/contracts";
import type { ReactNode } from "react";
import { stageDescription } from "../../profile-state";
import "./ProfileSummary.css";

export function ProfileSummary({
  profile,
  regionName,
  service,
}: {
  profile: SchoolProfile;
  regionName?: string | undefined;
  service?: ReactNode;
}) {
  const items = [
    ["学校名称", profile.schoolName],
    ["学校标识码", profile.schoolCode],
    ...(regionName ? [["所在地区", regionName]] : []),
    ["办学性质", profile.nature],
    ["学段与学制", stageDescription(profile)],
    [
      "联系人",
      [profile.contactName, profile.contactPhone].filter(Boolean).join(" · ") ||
        "未填写",
    ],
    ["学校地址", profile.address ?? "未填写"],
  ];
  return (
    <div className="school-profile-panels">
      <section className="school-profile-card school-profile-information">
        <h2>学校档案</h2>
        <dl>
          {items.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {service}
    </div>
  );
}
