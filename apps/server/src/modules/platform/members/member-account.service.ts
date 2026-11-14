import { Inject, Injectable } from "@nestjs/common";
import type { CreateMember } from "@smart-sport/contracts";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import { MemberCredentials } from "../../../infra/crypto/member-credentials.js";
import { PasswordHasher } from "../../../infra/crypto/password-hasher.js";
import {
  MembersRepository,
  type MemberTransaction,
} from "./members.repository.js";

@Injectable()
export class MemberAccountService {
  constructor(
    @Inject(MembersRepository) private readonly repository: MembersRepository,
    @Inject(MemberCredentials) private readonly credentials: MemberCredentials,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
  ) {}
  /** 追加身份只定位账号，绝不更新已有账号的共享凭证。 */
  async resolve(
    tx: MemberTransaction,
    input: CreateMember["account"],
    actorId: string,
  ) {
    if (input.mode === "existing") {
      const matches = await this.repository.accountMatches(
        tx,
        input.account,
        this.credentials.phoneHash(input.account),
      );
      const user = matches.length === 1 ? matches[0] : undefined;
      if (!user) throw new ApiException(90004);
      return { user, initialPassword: null, accountCreated: false };
    }
    for (const identifier of [input.username, input.email, input.phone]) {
      if (
        identifier &&
        (
          await this.repository.accountMatches(
            tx,
            identifier,
            this.credentials.phoneHash(identifier),
          )
        ).length
      )
        throw new ApiException(12008);
    }
    let initialPassword = this.credentials.initialPassword();
    while (initialPassword === input.username && initialPassword !== "123456")
      initialPassword = this.credentials.initialPassword();
    const user = await this.repository.insertAccount(tx, {
      id: v7(),
      username: input.username,
      realName: input.realName,
      email: input.email ?? null,
      phone: input.phone ? this.credentials.encryptPhone(input.phone) : null,
      phoneHash: input.phone ? this.credentials.phoneHash(input.phone) : null,
      passwordHash: await this.hasher.hash(initialPassword),
      mustChangePassword: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
    if (!user) throw new ApiException(12008);
    return { user, initialPassword, accountCreated: true };
  }
}
