import type { SchoolProfile } from "@smart-sport/contracts";
import { stageDescription } from "../../profile-state";
import "./ProfileSummary.css";

export function ProfileSummary({
  profile,
  regionName,
}: {
  profile: SchoolProfile;
  regionName?: string | undefined;
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
      <section className="school-profile-card school-profile-service">
        <h2>平台服务</h2>
        <p>服务状态暂未开放查询</p>
        <span>服务期和已开通模块将在平台服务功能接入后显示。</span>
        <span>需要调整服务，请联系负责的销售。</span>
      </section>
    </div>
  );
}
