/** 以经过的完整天数计算密码有效期；0禁用，缺少改密时间按过期处理。 */
export function passwordExpired(
  changedAt: Date | null,
  days: number,
  now: Date,
) {
  return (
    days > 0 &&
    (!changedAt || now.getTime() >= changedAt.getTime() + days * 86400000)
  );
}
