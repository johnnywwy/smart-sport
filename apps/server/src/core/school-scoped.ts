import { SetMetadata } from "@nestjs/common";

/** 标记显式学校路由；档案访问策略由对应模块守卫及事务内服务执行。 */
export const SCHOOL_SCOPED = Symbol("SCHOOL_SCOPED");
export const SchoolScoped = () => SetMetadata(SCHOOL_SCOPED, true);
