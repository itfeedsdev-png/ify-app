import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInPage } from "./SignInPage";

vi.mock("@client/api", () => ({
  getAppStatus: vi.fn(async () => ({
    appMode: "local",
    capabilities: {
      hostedSignups: false,
      platformLlm: false,
      quotas: false,
      userEditableLlmSettings: true,
    },
    hostedTenantConfigured: false,
  })),
  getAuthBootstrapStatus: vi.fn(async () => ({
    setupRequired: false,
  })),
  getOAuthProviders: vi.fn(async () => ({
    google: false,
    github: false,
  })),
  hasAuthenticatedSession: vi.fn(() => false),
  restoreAuthSessionFromLegacyCredentials: vi.fn(async () => false),
  setAuthenticatedSession: vi.fn(),
  startOAuth: vi.fn(),
  signupWithCredentials: vi.fn(async () => ({
    id: "user-1",
    username: "admin",
    displayName: null,
    isSystemAdmin: true,
    isDisabled: false,
    workspaceId: "tenant_default",
    workspaceName: "ify app",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  signInWithCredentials: vi.fn(async () => undefined),
}));

import {
  getAppStatus,
  getAuthBootstrapStatus,
  getOAuthProviders,
  hasAuthenticatedSession,
  restoreAuthSessionFromLegacyCredentials,
  signInWithCredentials,
  signupWithCredentials,
} from "@client/api";

const localAppStatus = {
  appMode: "local" as const,
  capabilities: {
    hostedSignups: false,
    platformLlm: false,
    quotas: false,
    userEditableLlmSettings: true,
  },
  hostedTenantConfigured: false,
};

const hostedSignupAppStatus = {
  appMode: "hosted" as const,
  capabilities: {
    hostedSignups: true,
    platformLlm: false,
    quotas: false,
    userEditableLlmSettings: true,
  },
  hostedTenantConfigured: true,
};

const hostedSignupDisabledAppStatus = {
  ...hostedSignupAppStatus,
  capabilities: {
    ...hostedSignupAppStatus.capabilities,
    hostedSignups: false,
  },
};

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(getAppStatus).mockResolvedValue(localAppStatus);
    vi.mocked(getAuthBootstrapStatus).mockResolvedValue({
      setupRequired: false,
    });
    vi.mocked(getOAuthProviders).mockResolvedValue({
      google: false,
      github: false,
    });
    vi.mocked(hasAuthenticatedSession).mockReturnValue(false);
    vi.mocked(restoreAuthSessionFromLegacyCredentials).mockResolvedValue(false);
    const authUser = {
      id: "user-1",
      username: "admin",
      displayName: null,
      isSystemAdmin: true,
      isDisabled: false,
      workspaceId: "tenant_default",
      workspaceName: "ify app",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(signupWithCredentials).mockResolvedValue(authUser);
    vi.mocked(signInWithCredentials).mockResolvedValue(undefined);
  });

  it("signs in and returns to the requested next route", async () => {
    render(
      <MemoryRouter initialEntries={["/sign-in?next=%2Fjobs%2Fready"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/jobs/ready" element={<div>ready-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(restoreAuthSessionFromLegacyCredentials).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signInWithCredentials).toHaveBeenCalledWith("admin", "secret");
      expect(screen.getByText("ready-page")).toBeInTheDocument();
    });
  });

  it("prefills a remembered username but still requires a password", async () => {
    localStorage.setItem(
      "jobops.rememberedAuthUsers",
      JSON.stringify([
        {
          username: "remembered-admin",
          displayName: null,
          rememberedAt: Date.now(),
        },
      ]),
    );

    render(
      <MemoryRouter initialEntries={["/sign-in?user=remembered-admin"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(restoreAuthSessionFromLegacyCredentials).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByLabelText("Username")).toHaveValue("remembered-admin");
    expect(screen.getByLabelText("Password")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter both username and password.",
    );
    expect(signInWithCredentials).not.toHaveBeenCalled();
  });

  it("sends first-run setup into onboarding", async () => {
    vi.mocked(getAuthBootstrapStatus).mockResolvedValueOnce({
      setupRequired: true,
    });

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("onboarding")).toBeInTheDocument();
    expect(signupWithCredentials).not.toHaveBeenCalled();
  });

  it("shows hosted signup toggle only when enabled by app status", async () => {
    vi.mocked(getAppStatus).mockResolvedValueOnce(hostedSignupAppStatus);

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // The new design uses plain <button> elements, not ARIA tab roles
    expect(
      await screen.findByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("hides hosted signup when hosted signups are disabled", async () => {
    vi.mocked(getAppStatus).mockResolvedValueOnce(
      hostedSignupDisabledAppStatus,
    );

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(restoreAuthSessionFromLegacyCredentials).toHaveBeenCalledTimes(1);
    });

    // When signup is disabled, there's only one "Sign in" button (the submit button)
    // and no "Create account" toggle button in the mode switcher
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("creates a hosted signup account and returns to the requested next route", async () => {
    vi.mocked(getAppStatus).mockResolvedValueOnce(hostedSignupAppStatus);
    vi.mocked(signupWithCredentials).mockResolvedValueOnce({
      id: "user-2",
      username: "new-user",
      displayName: "New User",
      isSystemAdmin: false,
      isDisabled: false,
      workspaceId: "tenant_hosted",
      workspaceName: "ify app",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter initialEntries={["/sign-in?next=%2Fjobs%2Fall"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/jobs/all" element={<div>all-jobs-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // Click the "Create account" mode toggle button
    const createAccountBtn = await screen.findByRole("button", {
      name: "Create account",
    });
    fireEvent.click(createAccountBtn);

    // Wait for the Name field to appear (signup mode)
    await screen.findByLabelText("Name");

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New User" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: " new-user " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "super-secret" },
    });

    // The submit button in signup mode says "Create account"
    // There are two "Create account" buttons: the toggle and the submit.
    // The submit button is type="submit" inside a form.
    const submitBtn = screen
      .getAllByRole("button", { name: "Create account" })
      .find((btn) => btn.getAttribute("type") === "submit");
    expect(submitBtn).toBeDefined();
    if (!submitBtn) throw new Error("Submit button not found");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(signupWithCredentials).toHaveBeenCalledWith({
        username: "new-user",
        password: "super-secret",
        displayName: "New User",
      });
      expect(screen.getByText("all-jobs-page")).toBeInTheDocument();
    });
    expect(localStorage.getItem("jobops.rememberedAuthUsers")).toContain(
      "new-user",
    );
  });
});
