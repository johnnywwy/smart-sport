import { Injectable } from "@nestjs/common";
import type { ExtraScope } from "@smart-sport/contracts";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Repository } from "../../../database/repository.js";
import {
  identities,
  identityScopes,
  organizations,
  regions,
} from "../../../schema/public.js";
import type { MemberTransaction } from "./members.repository.js";

@Injectable()
export class IdentityScopesRepository {
  read(tx: MemberTransaction, identityId: string) {
    return tx
      .select({
        type: identityScopes.scopeType,
        value: identityScopes.scopeValue,
      })
      .from(identityScopes)
      .where(eq(identityScopes.identityId, identityId))
      .orderBy(identityScopes.scopeType, identityScopes.scopeValue);
  }
  regionRows(tx: MemberTransaction, codes: string[]) {
    if (!codes.length) return [];
    return tx
      .select({ code: regions.code, path: regions.path })
      .from(regions)
      .where(and(inArray(regions.code, codes), eq(regions.status, 1)))
      .orderBy(regions.code)
      .for("share");
  }
  schoolRows(tx: MemberTransaction, ids: string[]) {
    if (!ids.length) return [];
    return tx
      .select({ id: organizations.id, path: regions.path })
      .from(organizations)
      .innerJoin(regions, eq(regions.code, organizations.regionCode))
      .where(
        and(
          inArray(organizations.id, ids),
          eq(organizations.type, "school"),
          eq(organizations.status, 1),
          isNull(organizations.deletedAt),
          eq(regions.status, 1),
        ),
      )
      .orderBy(organizations.id)
      .for("share", { of: [organizations, regions] });
  }
  async replace(
    tx: MemberTransaction,
    identityId: string,
    scopes: ExtraScope[],
  ) {
    await tx
      .delete(identityScopes)
      .where(eq(identityScopes.identityId, identityId));
    if (scopes.length)
      await tx.insert(identityScopes).values(
        scopes.map(({ type, value }) => ({
          identityId,
          scopeType: type,
          scopeValue: value,
        })),
      );
  }
  bump(
    tx: MemberTransaction,
    orgId: string,
    id: string,
    version: number,
    actorId: string,
  ) {
    return new Repository(tx, identities).updateWithVersion(
      { id, version, actorId, scope: eq(identities.orgId, orgId) },
      {},
    );
  }
}
