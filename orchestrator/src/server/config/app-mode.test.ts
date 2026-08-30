import { describe, expect, it } from "vitest";
import { getJobOpsAppConfig, getJobOpsAppStatus } from "./app-mode";

describe("hosted app-mode config", () => {
  it("defaults to local mode with hosted capabilities disabled", () => {
    expect(getJobOpsAppStatus({})).toEqual({
      appMode: "local",
      capabilities: {
        hostedSignups: false,
        platformLlm: false,
        quotas: false,
        userEditableLlmSettings: true,
      },
      hostedTenantConfigured: false,
    });
  });

  it("requires a hosted tenant id in hosted mode", () => {
    expect(() =>
      getJobOpsAppConfig({
        IFYAPP_APP_MODE: "hosted",
      }),
    ).toThrow(
      "IFYAPP_HOSTED_TENANT_ID is required when IFYAPP_APP_MODE=hosted.",
    );
  });

  it("rejects an invalid app mode", () => {
    expect(() =>
      getJobOpsAppConfig({
        IFYAPP_APP_MODE: "cloud",
      }),
    ).toThrow('IFYAPP_APP_MODE must be "local" or "hosted"');
  });

  it("rejects invalid boolean flags", () => {
    expect(() =>
      getJobOpsAppConfig({
        IFYAPP_HOSTED_SIGNUPS_ENABLED: "sometimes",
      }),
    ).toThrow("IFYAPP_HOSTED_SIGNUPS_ENABLED must be a boolean flag");
  });

  it("only activates hosted flags in hosted mode", () => {
    const localStatus = getJobOpsAppStatus({
      IFYAPP_HOSTED_SIGNUPS_ENABLED: "true",
      IFYAPP_HOSTED_PLATFORM_LLM_ENABLED: "true",
      IFYAPP_HOSTED_QUOTAS_ENABLED: "true",
      IFYAPP_HOSTED_TENANT_ID: "tenant_hosted",
    });
    expect(localStatus).toEqual({
      appMode: "local",
      capabilities: {
        hostedSignups: false,
        platformLlm: false,
        quotas: false,
        userEditableLlmSettings: true,
      },
      hostedTenantConfigured: false,
    });

    const hostedStatus = getJobOpsAppStatus({
      IFYAPP_APP_MODE: "hosted",
      IFYAPP_HOSTED_SIGNUPS_ENABLED: "true",
      IFYAPP_HOSTED_PLATFORM_LLM_ENABLED: "true",
      IFYAPP_HOSTED_QUOTAS_ENABLED: "true",
      IFYAPP_HOSTED_TENANT_ID: "tenant_hosted",
    });
    expect(hostedStatus).toEqual({
      appMode: "hosted",
      capabilities: {
        hostedSignups: true,
        platformLlm: true,
        quotas: true,
        userEditableLlmSettings: false,
      },
      hostedTenantConfigured: true,
    });
  });
});
