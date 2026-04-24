import { Injectable } from "@nestjs/common";
import type { AccessEntitlement, User } from "@prisma/client";
import type { UserAccessSnapshot } from "@eon/shared-domain";

function now(): Date {
  return new Date();
}

function isActiveExpires(expiresAt: Date | null | undefined, at: Date): boolean {
  if (expiresAt == null) {
    return true;
  }
  return expiresAt.getTime() > at.getTime();
}

@Injectable()
export class AccessService {
  resolve(user: User & { entitlements: AccessEntitlement[] }): UserAccessSnapshot {
    const t = now();
    const reasons: string[] = [];
    if (user.isBanned) {
      reasons.push("banned");
      return {
        tier: "blocked",
        canUseBot: false,
        canViewEvents: false,
        freeViewsLeft: user.freeViewsLeft,
        isBanned: true,
        reasons
      };
    }

    const activeAdmin = user.entitlements.find(
      (e) => e.type === "ADMIN_BYPASS" && isActiveExpires(e.expiresAt, t)
    );
    if (activeAdmin) {
      reasons.push("admin_bypass");
      return {
        tier: "admin",
        canUseBot: true,
        canViewEvents: true,
        freeViewsLeft: user.freeViewsLeft,
        isBanned: false,
        reasons
      };
    }

    if (user.isUnlimitedLifetime) {
      reasons.push("unlimited_lifetime");
      return {
        tier: "unlimited",
        canUseBot: true,
        canViewEvents: true,
        freeViewsLeft: user.freeViewsLeft,
        isBanned: false,
        reasons
      };
    }

    const unlim = user.entitlements.find(
      (e) => e.type === "UNLIMITED_LIFETIME" && isActiveExpires(e.expiresAt, t)
    );
    if (unlim) {
      reasons.push("entitlement_unlimited_lifetime");
      return {
        tier: "unlimited",
        canUseBot: true,
        canViewEvents: true,
        freeViewsLeft: user.freeViewsLeft,
        isBanned: false,
        reasons
      };
    }

    const paid = user.entitlements.find(
      (e) => e.type === "PAID_PACK" && isActiveExpires(e.expiresAt, t)
    );
    if (paid) {
      const cap = paid.viewsTotal;
      const used = paid.viewsUsed;
      const hasViews = cap == null || used < cap;
      if (hasViews) {
        reasons.push("paid_pack");
        return {
          tier: "premium",
          canUseBot: true,
          canViewEvents: true,
          freeViewsLeft: user.freeViewsLeft,
          isBanned: false,
          reasons
        };
      }
    }

    const trial = user.entitlements.find(
      (e) => e.type === "TRIAL" && isActiveExpires(e.expiresAt, t)
    );
    if (trial) {
      reasons.push("trial");
      return {
        tier: "trial",
        canUseBot: true,
        canViewEvents: true,
        freeViewsLeft: user.freeViewsLeft,
        isBanned: false,
        reasons
      };
    }

    const freePack = user.entitlements.find(
      (e) => e.type === "FREE_PACK" && isActiveExpires(e.expiresAt, t)
    );
    if (freePack) {
      const cap = freePack.viewsTotal;
      const used = freePack.viewsUsed;
      if (cap == null) {
        reasons.push("free_pack");
        return {
          tier: "free",
          canUseBot: true,
          canViewEvents: true,
          freeViewsLeft: user.freeViewsLeft,
          isBanned: false,
          reasons
        };
      }
      const remaining = cap - used;
      if (remaining > 0) {
        reasons.push("free_pack");
        return {
          tier: "free",
          canUseBot: true,
          canViewEvents: true,
          freeViewsLeft: user.freeViewsLeft,
          isBanned: false,
          reasons
        };
      }
    }

    reasons.push("free_tier");
    const canViewEvents = user.freeViewsLeft > 0;
    return {
      tier: "free",
      canUseBot: true,
      canViewEvents,
      freeViewsLeft: user.freeViewsLeft,
      isBanned: false,
      reasons
    };
  }
}
