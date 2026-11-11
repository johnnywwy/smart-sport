import { SetMetadata } from "@nestjs/common";

export const AUTH_POLICY = Symbol("AUTH_POLICY");
/** 无 access token 的登录、刷新、退出和健康检查。 */
export const PublicRoute = () => SetMetadata(AUTH_POLICY, "public");
/** 仅限列出身份、选择身份及改密；其他接口默认要求身份级令牌。 */
export const AccountAllowed = () => SetMetadata(AUTH_POLICY, "account");
