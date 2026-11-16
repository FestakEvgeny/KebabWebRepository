import { AdminUser } from './admin-user.entity';
import { AdminAuthService } from './admin-auth.service';
import { AdminModule, ADMIN_ROUTER } from './admin.module';
import { DashboardStats } from './dashboard-stats';

/** Entities owned by the admin module; assembled into the DataSource by the database layer. */
export const adminEntities = [AdminUser];

export { AdminUser, AdminAuthService, AdminModule, ADMIN_ROUTER };
export type { DashboardStats };
