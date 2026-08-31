/**
 * API routes for the orchestrator.
 */

import { Router } from "express";
import { appStatusRouter } from "./routes/app-status";
import { authRouter } from "./routes/auth";
import { backupRouter } from "./routes/backup";
import { databaseRouter } from "./routes/database";
import { demoRouter } from "./routes/demo";
import { designResumeRouter } from "./routes/design-resume";
import { extractorHealthRouter } from "./routes/extractor-health";
import { ghostwriterRouter } from "./routes/ghostwriter";
import { jobsRouter } from "./routes/jobs";
import { manualJobsRouter } from "./routes/manual-jobs";
import { oauthRouter } from "./routes/oauth";
import { onboardingRouter } from "./routes/onboarding";
import { personalBrandRouter } from "./routes/personal-brand";
import { pipelineRouter } from "./routes/pipeline";
import { postApplicationProvidersRouter } from "./routes/post-application-providers";
import { postApplicationReviewRouter } from "./routes/post-application-review";
import { profileRouter } from "./routes/profile";
import { settingsRouter } from "./routes/settings";
import { socialRouter } from "./routes/social-media";
import { tracerLinksRouter } from "./routes/tracer-links";
import { watchlistRouter } from "./routes/watchlist";
import { webhookRouter } from "./routes/webhook";
import { workdayRouter } from "./routes/workday";
import { workspacesRouter } from "./routes/workspaces";

export const apiRouter = Router();

apiRouter.use("/app", appStatusRouter);
apiRouter.use("/jobs", jobsRouter);
apiRouter.use("/jobs/:id/chat", ghostwriterRouter);
apiRouter.use("/demo", demoRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/pipeline", pipelineRouter);
apiRouter.use("/post-application", postApplicationProvidersRouter);
apiRouter.use("/post-application", postApplicationReviewRouter);
apiRouter.use("/manual-jobs", manualJobsRouter);
apiRouter.use("/webhook", webhookRouter);
apiRouter.use("/profile", profileRouter);
apiRouter.use("/database", databaseRouter);
apiRouter.use("/design-resume", designResumeRouter);
apiRouter.use("/onboarding", onboardingRouter);
apiRouter.use("/backups", backupRouter);
apiRouter.use("/tracer-links", tracerLinksRouter);
apiRouter.use("/workspaces", workspacesRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/auth/oauth", oauthRouter);
apiRouter.use("/social", socialRouter);
apiRouter.use("/personal-brand", personalBrandRouter);
apiRouter.use("/workday", workdayRouter);
apiRouter.use("/watchlist", watchlistRouter);
apiRouter.use("/", extractorHealthRouter);
