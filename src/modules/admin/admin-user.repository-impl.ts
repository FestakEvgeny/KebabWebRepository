import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AdminUser } from './admin-user.entity';
import { IAdminUserRepository, NewAdminUser } from './admin-user.repository';

/**
 * TypeORM-backed implementation of the admin-user repository port. It is the
 * only place in the admin module that touches the TypeORM repository for
 * admin_user; the service depends on IAdminUserRepository instead.
 */
@Injectable()
export class AdminUserRepositoryImpl implements IAdminUserRepository {
  private readonly repo: Repository<AdminUser>;

  // The token is declared explicitly instead of relying on reflected
  // paramtypes so the DI graph survives the esbuild-based dev runner.
  constructor(@Inject(DataSource) ds: DataSource) {
    this.repo = ds.getRepository(AdminUser);
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    return this.repo.findOneBy({ email });
  }

  async add(data: NewAdminUser): Promise<AdminUser> {
    return this.repo.save(this.repo.create(data));
  }
}
