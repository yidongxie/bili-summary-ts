/** Express routes – composed from sub-routers. */

import { Router } from "express";
import Database from "better-sqlite3";
import { createHealthRouter } from "./health";
import { createConfigRouter } from "./config";
import { createLlmRouter } from "./llm";
import { createLibraryRouter } from "./library";
import { createExportRouter } from "./export";
import { createLearningRouter } from "./learning";
import { createAdminRouter } from "./admin";
import { createChatRouter } from "./chat";
import { createAudioProxyRouter } from "./audioProxy";
import { createYtDlpRouter } from "./ytDlp";
import { createDownloadRouter } from "./download";
import { createThemesRouter } from "./themes";

export function createApiRouter(db: Database.Database): Router {
  const router = Router();

  router.use(createHealthRouter());
  router.use(createConfigRouter(db));
  router.use(createLlmRouter(db));
  router.use(createLibraryRouter(db));
  router.use(createExportRouter(db));
  router.use(createLearningRouter(db));
  router.use(createAdminRouter(db));
  router.use(createChatRouter(db));
  router.use(createAudioProxyRouter());
  router.use(createYtDlpRouter());
  router.use(createDownloadRouter(db));
  router.use(createThemesRouter(db));

  return router;
}
