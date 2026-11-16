import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { User } from './user.entity';
import { IUserRepository, NewUser } from './user.repository';

/**
 * TypeORM-backed implementation of the user repository port. It is the only
 * place in the oauth module that touches the TypeORM repository for
 * user_table; the service depends on IUserRepository instead.
 */
@Injectable()
export class UserRepositoryImpl implements IUserRepository {
  private readonly repo: Repository<User>;

  // The token is declared explicitly instead of relying on reflected
  // paramtypes so the DI graph survives the esbuild-based dev runner.
  constructor(@Inject(DataSource) ds: DataSource) {
    this.repo = ds.getRepository(User);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOneBy({ email });
  }

  async add(data: NewUser): Promise<User> {
    return this.repo.save(this.repo.create(data));
  }
}
