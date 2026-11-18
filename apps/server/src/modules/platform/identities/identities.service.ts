import { Inject, Injectable } from "@nestjs/common";
import type {
  IdentityList,
  IdentitySummary,
  SelectIdentityRequest,
  SelectIdentityResponse,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import type { AuthenticatedClaims } from "../../../core/authenticated.guard.js";
import { AccessTokenSigner } from "../../../infra/auth/access-token-signer.js";
import { RolesService } from "../roles/index.js";
import { SubscriptionStateService } from "../subscription/index.js";
import {
  IdentitiesRepository,
  type IdentitiesTransaction,
} from "./identities.repository.js";
import {
  groupType,
  identityGroupNames,
  presentIdentity,
} from "./identity-presenter.js";

type Metadata = { traceId: string; ip: string; userAgent: string };

@Injectable()
export class IdentitiesService {
  constructor(
    @Inject(IdentitiesRepository)
    private readonly identities: IdentitiesRepository,
    @Inject(AccessTokenSigner) private readonly signer: AccessTokenSigner,
    @Inject(SubscriptionStateService)
    private readonly subscriptions: SubscriptionStateService,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  list(claims: AuthenticatedClaims): Promise<IdentityList> {
    return this.identities.transaction(async (tx) => {
      const session = await this.requireSession(tx, claims);
      const items = await this.listItems(
        tx,
        claims.userId,
        session.user.lastIdentityId,
      );
      return this.group(items);
    });
  }

  session(claims: AuthenticatedClaims) {
    return this.identities.transaction(async (tx) => {
      const found = await this.requireSession(tx, claims);
      const items = await this.listItems(
        tx,
        claims.userId,
        found.user.lastIdentityId,
      );
      const currentIdentity =
        items.find(
          (item) => item.id === found.session.identityId && item.available,
        ) ?? null;
      return {
        mustChangePassword: found.user.mustChangePassword,
        identityCount: items.filter((item) => item.available).length,
        currentIdentity,
      };
    });
  }

  select(
    claims: AuthenticatedClaims,
    input: SelectIdentityRequest,
    metadata: Metadata,
  ): Promise<SelectIdentityResponse> {
    return this.identities.transaction(async (tx) => {
      const session = await this.requireSession(tx, claims, true);
      // 账号级令牌只能在完成强制改密后进入业务身份。
      if (session.user.mustChangePassword) throw new ApiException(11101);
      const row = await this.identities.findOwnedIdentity(
        tx,
        claims.userId,
        input.identityId,
      );
      if (!row || row.deletedAt) throw new ApiException(11001);
      if (row.status !== 1) throw new ApiException(11002);
      if (row.orgDeletedAt || row.orgStatus !== 1)
        throw new ApiException(11003);
      const identity = presentIdentity(
        row,
        (await this.identities.roleMap(tx, [row.id])).get(row.id) ?? [],
        row.id,
      );
      if (!identity.available) throw new ApiException(11004);
      if (row.orgType === "school")
        await this.subscriptions.requireEntry({
          orgId: row.orgId,
          orgType: row.orgType,
          identityType: identity.type,
          permissions: await this.roles.permissions(identity.roleIds, tx),
        });
      const date = new Date();
      await this.identities.selectIdentity(tx, {
        userId: claims.userId,
        sessionId: claims.sessionId,
        identityId: row.id,
        orgId: row.orgId,
        date,
        metadata,
      });
      return {
        accessToken: await this.signer.signIdentity({
          userId: claims.userId,
          sessionId: claims.sessionId,
          tokenVersion: session.user.tokenVersion,
          identityId: row.id,
        }),
        identity: { ...identity, lastUsed: true },
      };
    });
  }

  /** 登录提交后调用；唯一可用身份直接绑定到刚创建的会话。 */
  async autoSelectAfterLogin(
    input: {
      userId: string;
      sessionId: string;
      tokenVersion: number;
    },
    metadata: Metadata,
  ) {
    const claims: AuthenticatedClaims = {
      ...input,
      stage: "account",
    };
    const list = await this.list(claims);
    const available = list.groups
      .flatMap((group) => group.items)
      .filter((identity) => identity.available);
    if (available.length !== 1) {
      return { identityCount: available.length, selectedIdentity: null };
    }
    const selected = await this.select(
      claims,
      { identityId: available[0]?.id ?? "" },
      metadata,
    );
    return {
      identityCount: 1,
      selectedIdentity: selected.identity,
      accessToken: selected.accessToken,
    };
  }

  revokeSession(sessionId: string) {
    return this.identities.revokeSession(sessionId);
  }

  private async requireSession(
    tx: IdentitiesTransaction,
    claims: AuthenticatedClaims,
    lock = false,
  ) {
    const found = await this.identities.findSession(
      tx,
      { userId: claims.userId, sessionId: claims.sessionId },
      lock,
    );
    const now = new Date();
    if (
      !found ||
      found.session.revokedAt ||
      found.session.deletedAt ||
      found.session.expiresAt <= now ||
      found.session.client !== "admin" ||
      found.user.deletedAt ||
      found.user.status !== 1 ||
      found.user.tokenVersion !== claims.tokenVersion
    ) {
      throw new ApiException(10005);
    }
    return found;
  }

  private async listItems(
    tx: IdentitiesTransaction,
    userId: string,
    lastIdentityId: string | null,
  ) {
    const rows = await this.identities.listRows(tx, userId);
    const roles = await this.identities.roleMap(
      tx,
      rows.map((row) => row.id),
    );
    return Promise.all(
      rows.map(async (row) => {
        const item = presentIdentity(
          row,
          roles.get(row.id) ?? [],
          lastIdentityId,
        );
        if (item.available && row.orgType === "school") {
          try {
            await this.subscriptions.requireEntry({
              orgId: row.orgId,
              orgType: row.orgType,
              identityType: item.type,
              permissions: await this.roles.permissions(item.roleIds, tx),
            });
          } catch (error) {
            if (!(error instanceof ApiException && error.code === 13003))
              throw error;
            return {
              ...item,
              available: false,
              unavailableReason: "学校服务未开通或已停用",
            };
          }
        }
        return item;
      }),
    );
  }

  private group(items: IdentitySummary[]): IdentityList {
    const groupOrder = ["company", "bureau", "agent", "school"] as const;
    const groups = groupOrder.flatMap((type) => {
      const grouped = items
        .filter((identity) => groupType(identity.type) === type)
        .sort(
          (left, right) =>
            Number(right.lastUsed) - Number(left.lastUsed) ||
            left.orgName.localeCompare(right.orgName, "zh-CN"),
        );
      return grouped.length
        ? [{ type, typeName: identityGroupNames[type], items: grouped }]
        : [];
    });
    return {
      groups,
      total: items.length,
      availableCount: items.filter((identity) => identity.available).length,
    };
  }
}
