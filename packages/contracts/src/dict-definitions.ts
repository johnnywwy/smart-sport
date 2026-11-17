import type { DictTypeCode } from "./dicts.js";
import { identityTypeNames } from "./identities.js";

type Option = { value: string; label: string; description?: string };
type Definition = {
  code: DictTypeCode;
  name: string;
  allowCustom: boolean;
  items: readonly Option[];
};
const options = (values: readonly (readonly [string, string])[]): Option[] =>
  values.map(([value, label]) => ({ value, label }));
// 民族名称与01—56顺序参考高校公开《全国教职工基础信息采集表》基础代码表。
// https://zzb.nbt.edu.cn/__local/9/AC/73/1B15B52A9A491FF9B9255594415_FBDE015A_16E319.pdf
const ethnicities =
  "汉族 蒙古族 回族 藏族 维吾尔族 苗族 彝族 壮族 布依族 朝鲜族 满族 侗族 瑶族 白族 土家族 哈尼族 哈萨克族 傣族 黎族 傈僳族 佤族 畲族 高山族 拉祜族 水族 东乡族 纳西族 景颇族 柯尔克孜族 土族 达斡尔族 仫佬族 羌族 布朗族 撒拉族 毛南族 仡佬族 锡伯族 阿昌族 普米族 塔吉克族 怒族 乌孜别克族 俄罗斯族 鄂温克族 德昂族 保安族 裕固族 京族 塔塔尔族 独龙族 鄂伦春族 赫哲族 门巴族 珞巴族 基诺族".split(
    " ",
  );
const gradeNames = [
  ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
  ["初一", "初二", "初三", "初四"],
  ["高一", "高二", "高三"],
  ["大一", "大二", "大三", "大四", "大五"],
];
/** 值由代码声明；只有证件类型可以扩展，不用字典新增替代业务能力开发。 */
export const dictDefinitions: readonly Definition[] = [
  {
    code: "gender",
    name: "性别",
    allowCustom: false,
    items: options([
      ["1", "男"],
      ["2", "女"],
    ]),
  },
  {
    code: "ethnicity",
    name: "民族",
    allowCustom: false,
    items: ethnicities.map((label, i) => ({
      value: String(i + 1).padStart(2, "0"),
      label,
    })),
  },
  {
    code: "stage",
    name: "学段",
    allowCustom: false,
    items: [
      {
        value: "1",
        label: "小学",
        description: "默认六年，可以按学校改为五年",
      },
      {
        value: "2",
        label: "初中",
        description: "默认三年，可以按学校改为四年",
      },
      { value: "3", label: "高中", description: "三年" },
      { value: "4", label: "大学", description: "年限按学校设置" },
    ],
  },
  {
    code: "grade",
    name: "年级",
    allowCustom: false,
    items: gradeNames.flatMap((names, stage) =>
      names.map((label, ordinal) => ({
        value: String((stage + 1) * 10 + ordinal + 1),
        label,
      })),
    ),
  },
  {
    code: "document_type",
    name: "证件类型",
    allowCustom: true,
    items: options([
      ["resident_id", "居民身份证"],
      ["passport", "护照"],
      ["hk_macau_travel_permit", "港澳居民来往内地通行证"],
      ["taiwan_travel_permit", "台湾居民来往大陆通行证"],
    ]),
  },
  {
    code: "organization_type",
    name: "组织类型",
    allowCustom: false,
    items: options([
      ["company", "公司"],
      ["bureau", "教育局"],
      ["agent", "代理商"],
      ["school", "学校"],
    ]),
  },
  {
    code: "identity_type",
    name: "身份类型",
    allowCustom: false,
    items: Object.entries(identityTypeNames).map(([value, label]) => ({
      value,
      label,
    })),
  },
];
