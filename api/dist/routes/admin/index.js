import { adminApplicationsRoutes } from "./applications.js";
import { adminApplicationsOpsRoutes } from "./applications-ops.js";
import { adminExamRoundsRoutes } from "./exam-rounds.js";
import { adminExamVenuesRoutes } from "./exam-venues.js";
import { adminAdminUsersRoutes } from "./admin-users.js";
import { adminBoardRoutes } from "./board.js";
import { adminNoticesRoutes } from "./notices.js";
import { adminFaqRoutes } from "./faq.js";
import { adminTermsRoutes } from "./terms.js";
import { adminUsersRoutes } from "./users.js";
import { adminAuditLogsRoutes } from "./audit-logs.js";
export async function adminRoutes(app) {
    await app.register(adminApplicationsRoutes);
    await app.register(adminApplicationsOpsRoutes);
    await app.register(adminExamRoundsRoutes);
    await app.register(adminExamVenuesRoutes);
    await app.register(adminBoardRoutes);
    await app.register(adminNoticesRoutes);
    await app.register(adminFaqRoutes);
    await app.register(adminTermsRoutes);
    await app.register(adminUsersRoutes);
    await app.register(adminAdminUsersRoutes);
    await app.register(adminAuditLogsRoutes);
}
