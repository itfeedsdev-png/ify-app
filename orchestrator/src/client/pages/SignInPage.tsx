import {
  getAppStatus,
  getAuthBootstrapStatus,
  getOAuthProviders,
  hasAuthenticatedSession,
  restoreAuthSessionFromLegacyCredentials,
  setAuthenticatedSession,
  signInWithCredentials,
  signupWithCredentials,
  startOAuth,
} from "@client/api";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  loadRememberedAuthUsers,
  rememberAuthUser,
} from "../lib/remembered-auth-users";

type AuthMode = "sign-in" | "signup";

function resolveNextPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith("/")) return "/jobs/ready";
  if (rawNext === "/sign-in" || rawNext.startsWith("/sign-in?")) {
    return "/jobs/ready";
  }
  return rawNext;
}

/* ─── OAuth error map ──────────────────────────────────────────────────────── */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "OAuth sign-in was cancelled.",
  oauth_failed: "OAuth sign-in failed. Please try again.",
  not_configured: "This OAuth provider is not configured yet.",
  unknown_provider: "Unknown OAuth provider.",
};

/* ─── SVG brand icons ──────────────────────────────────────────────────────── */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", className)}
      fill="currentColor"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/* ─── Decorative background pattern for left panel ─────────────────────────── */
function DotPattern({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="dot-pattern"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" className="fill-white/10" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-pattern)" />
    </svg>
  );
}

/* ─── Left brand panel ─────────────────────────────────────────────────────── */
function BrandPanel() {
  return (
    <div className="relative hidden h-full flex-col justify-between bg-zinc-950 p-10 text-white lg:flex lg:w-1/2">
      <DotPattern className="absolute inset-0 pointer-events-none" />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-lg">
          <span className="text-sm font-bold text-zinc-950">i</span>
        </div>
        <span className="text-lg font-semibold tracking-tight">ify app</span>
      </div>

      {/* Quote */}
      <div className="relative z-10">
        <blockquote className="space-y-3">
          <p className="text-xl font-medium leading-relaxed">
            "The best way to predict the future is to create it."
          </p>
          <footer className="text-sm text-zinc-400">Peter Drucker</footer>
        </blockquote>
      </div>
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────────────────────── */
export function SignInPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [hostedSignupEnabled, setHostedSignupEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [isOAuthBusy, setIsOAuthBusy] = useState<"google" | "github" | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oauthProviders, setOAuthProviders] = useState<{
    google: boolean;
    github: boolean;
  }>({ google: false, github: false });
  const [rememberedUsers, setRememberedUsers] = useState(() =>
    loadRememberedAuthUsers(),
  );

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return resolveNextPath(params.get("next"));
  }, [location.search]);

  /* ── Handle OAuth callback token in URL ─────────────────────────────────── */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthToken = params.get("oauth_token");
    const oauthError = params.get("error");

    if (oauthError) {
      setErrorMessage(
        OAUTH_ERROR_MESSAGES[oauthError] ?? "OAuth sign-in failed.",
      );
      window.history.replaceState(null, "", "/sign-in");
      return;
    }

    if (oauthToken) {
      setAuthenticatedSession(oauthToken);
      window.history.replaceState(null, "", "/sign-in");
      navigate(nextPath, { replace: true });
    }
  }, [location.search, navigate, nextPath]);

  /* ── Bootstrap check + session restore ──────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [appStatus, bootstrap, providers] = await Promise.all([
          getAppStatus(),
          getAuthBootstrapStatus(),
          getOAuthProviders().catch(() => ({ google: false, github: false })),
        ]);

        if (cancelled) return;

        setOAuthProviders(providers);

        const canSignup =
          appStatus.appMode === "hosted" &&
          appStatus.capabilities.hostedSignups;
        setHostedSignupEnabled(canSignup);

        if (bootstrap.setupRequired) {
          navigate("/onboarding", { replace: true });
          return;
        }

        const restored = await restoreAuthSessionFromLegacyCredentials();
        if (cancelled) return;
        if (restored || hasAuthenticatedSession()) {
          navigate(nextPath, { replace: true });
          return;
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load sign-in status.",
          );
        }
      } finally {
        if (!cancelled) setIsBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, nextPath]);

  /* ── Remembered user from URL param ─────────────────────────────────────── */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rememberedUsername = params.get("user")?.trim();
    if (rememberedUsername) {
      setUsername(rememberedUsername);
      setPassword("");
    }
  }, [location.search]);

  /* ── Credential form submit ──────────────────────────────────────────────── */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setErrorMessage("Enter both username and password.");
      return;
    }
    if (authMode === "signup" && password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      if (authMode === "signup") {
        const user = await signupWithCredentials({
          username: normalizedUsername,
          password,
          displayName: displayName.trim() || normalizedUsername,
        });
        setRememberedUsers(
          rememberAuthUser({
            username: user.username,
            displayName: user.displayName,
          }),
        );
      } else {
        await signInWithCredentials(normalizedUsername, password);
        setRememberedUsers(rememberAuthUser({ username: normalizedUsername }));
      }
      navigate(nextPath, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in",
      );
      setIsBusy(false);
    }
  };

  /* ── OAuth button click ──────────────────────────────────────────────────── */
  const handleOAuth = (provider: "google" | "github") => {
    setIsOAuthBusy(provider);
    setErrorMessage(null);
    startOAuth(provider);
  };

  const resetFormFeedback = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setErrorMessage(null);
    setPassword("");
  };

  const hasOAuth = oauthProviders.google || oauthProviders.github;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: decorative */}
      <BrandPanel />

      {/* Right: form */}
      <div className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-[360px] space-y-6">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950">
              <span className="text-sm font-bold text-white">i</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">
              ify app
            </span>
          </div>

          {/* Heading */}
          <div className="space-y-1.5 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {authMode === "signup" ? "Create an account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {authMode === "signup"
                ? "Enter your details below to create your account"
                : "Enter your credentials to access your account"}
            </p>
          </div>

          {/* OAuth buttons */}
          {hasOAuth && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {oauthProviders.google && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isBusy || isOAuthBusy !== null}
                    onClick={() => handleOAuth("google")}
                  >
                    {isOAuthBusy === "google" ? (
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <GoogleIcon className="mr-2" />
                    )}
                    Google
                  </Button>
                )}
                {oauthProviders.github && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isBusy || isOAuthBusy !== null}
                    onClick={() => handleOAuth("github")}
                  >
                    {isOAuthBusy === "github" ? (
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <GitHubIcon className="mr-2" />
                    )}
                    GitHub
                  </Button>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Sign-in / Sign-up tabs (hosted mode) */}
          {hostedSignupEnabled && (
            <div className="flex rounded-lg border p-1">
              {(["sign-in", "signup"] as AuthMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => resetFormFeedback(mode)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                    authMode === mode
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "sign-in" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
          )}

          {/* Remembered users */}
          {authMode === "sign-in" && rememberedUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Remembered on this browser
              </p>
              <div className="flex flex-wrap gap-2">
                {rememberedUsers.map((user) => (
                  <Button
                    key={user.username}
                    type="button"
                    variant={
                      username.trim() === user.username
                        ? "secondary"
                        : "outline"
                    }
                    size="sm"
                    className="h-8 max-w-full px-2.5"
                    disabled={isBusy}
                    onClick={() => {
                      setUsername(user.username);
                      setPassword("");
                      setErrorMessage(null);
                    }}
                  >
                    <span className="truncate">
                      {user.displayName ?? user.username}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Credentials form */}
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            {authMode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="auth-display-name">Name</Label>
                <Input
                  id="auth-display-name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.currentTarget.value)}
                  placeholder="Your name"
                  disabled={isBusy}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-username">Username</Label>
              <Input
                id="auth-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                placeholder="Enter username"
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder="Enter password"
                disabled={isBusy}
              />
            </div>

            {errorMessage && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-sm text-destructive" role="alert">
                  {errorMessage}
                </p>
              </div>
            )}

            <Button
              className="w-full"
              type="submit"
              disabled={isBusy || isOAuthBusy !== null}
            >
              {isBusy
                ? authMode === "signup"
                  ? "Creating account…"
                  : "Signing in…"
                : authMode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>

          {/* Bottom note */}
          <p className="text-center text-xs text-muted-foreground">
            By continuing, you agree to our{" "}
            <span className="underline underline-offset-2 hover:text-foreground cursor-pointer transition-colors">
              Terms of Service
            </span>{" "}
            and{" "}
            <span className="underline underline-offset-2 hover:text-foreground cursor-pointer transition-colors">
              Privacy Policy
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
